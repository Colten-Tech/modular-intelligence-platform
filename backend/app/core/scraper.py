import asyncio
import logging
import random
import re
import urllib.robotparser
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

MAX_RETRIES = 3
REQUEST_TIMEOUT = 30_000  # ms
MIN_DELAY = 2.0
MAX_DELAY = 8.0


class ScraperEngine:
    def __init__(self):
        self._robots_cache: dict[str, urllib.robotparser.RobotFileParser] = {}

    async def _check_robots(self, url: str) -> bool:
        """Returns True if crawling is allowed, False if disallowed."""
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        robots_url = f"{base}/robots.txt"

        if base not in self._robots_cache:
            try:
                import httpx

                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(robots_url)
                    rp = urllib.robotparser.RobotFileParser()
                    rp.set_url(robots_url)
                    rp.parse(resp.text.splitlines())
                    self._robots_cache[base] = rp
            except Exception:
                # If we can't fetch robots.txt, allow crawling
                return True

        rp = self._robots_cache[base]
        return rp.can_fetch("*", url)

    async def fetch(
        self,
        url: str,
        js_render: bool = True,
        wait_selector: Optional[str] = None,
    ) -> str:
        """
        Fetch a URL and return page HTML.
        Uses Playwright if js_render=True, else falls back to httpx.
        Retries up to MAX_RETRIES with random delay between requests.
        """
        # Check robots.txt
        allowed = await self._check_robots(url)
        if not allowed:
            logger.warning(f"robots.txt disallows crawling {url}")
            return ""

        last_error: Optional[Exception] = None

        for attempt in range(1, MAX_RETRIES + 1):
            # Random delay to be polite
            delay = random.uniform(MIN_DELAY, MAX_DELAY)
            if attempt > 1:
                await asyncio.sleep(delay)
            else:
                await asyncio.sleep(random.uniform(0.5, 2.0))

            user_agent = random.choice(USER_AGENTS)

            try:
                if js_render:
                    html = await self._playwright_fetch(url, user_agent, wait_selector)
                else:
                    html = await self._httpx_fetch(url, user_agent)
                return html
            except Exception as exc:
                last_error = exc
                logger.warning(f"Fetch attempt {attempt}/{MAX_RETRIES} failed for {url}: {exc}")

        logger.error(f"All {MAX_RETRIES} fetch attempts failed for {url}: {last_error}")
        raise RuntimeError(f"Failed to fetch {url} after {MAX_RETRIES} attempts: {last_error}")

    async def _playwright_fetch(
        self,
        url: str,
        user_agent: str,
        wait_selector: Optional[str],
    ) -> str:
        # Graceful fallback: if Playwright isn't installed OR browser binaries are
        # absent (e.g. Render/Docker without `playwright install`), fall through to httpx.
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.warning("Playwright package not installed — falling back to httpx for %s", url)
            return await self._httpx_fetch(url, user_agent)

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-blink-features=AutomationControlled",
                    ],
                )
                context = await browser.new_context(
                    user_agent=user_agent,
                    viewport={"width": 1280, "height": 800},
                    locale="en-US",
                )
                page = await context.new_page()

                try:
                    await page.goto(url, timeout=REQUEST_TIMEOUT, wait_until="domcontentloaded")

                    if wait_selector:
                        try:
                            await page.wait_for_selector(wait_selector, timeout=10_000)
                        except Exception:
                            pass  # Continue even if selector not found

                    # Extra wait for dynamic content
                    await page.wait_for_timeout(1500)
                    html = await page.content()
                    return html
                finally:
                    await browser.close()
        except Exception as exc:
            # Browser binaries not present, sandbox failure, or any other Playwright error.
            # Fall back to httpx so the module still gets *some* HTML rather than crashing.
            logger.warning(
                "Playwright launch failed (%s) — falling back to httpx for %s", exc, url
            )
            return await self._httpx_fetch(url, user_agent)

    async def _httpx_fetch(self, url: str, user_agent: str) -> str:
        import httpx

        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": user_agent},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.text

    async def fetch_multiple(self, urls: list[str], js_render: bool = True) -> dict[str, str]:
        """
        Concurrently fetch multiple URLs with rate limiting (max 3 concurrent).
        Returns dict of url → html.
        """
        semaphore = asyncio.Semaphore(3)

        async def _limited_fetch(url: str) -> tuple[str, str]:
            async with semaphore:
                try:
                    html = await self.fetch(url, js_render=js_render)
                    return url, html
                except Exception as exc:
                    logger.error(f"fetch_multiple: failed for {url}: {exc}")
                    return url, ""

        tasks = [_limited_fetch(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return dict(results)


# Singleton instance
scraper_engine = ScraperEngine()
