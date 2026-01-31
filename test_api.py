#!/usr/bin/env python3
"""Quick test script to debug API connection."""

import asyncio
import os
import time
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_BASE_URL = os.getenv("ANTHROPIC_BASE_URL")
ANTHROPIC_AUTH_TOKEN = os.getenv("ANTHROPIC_AUTH_TOKEN")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "gpt-5-mini")

print(f"Testing API connection...")
print(f"  Base URL: {ANTHROPIC_BASE_URL}")
print(f"  Model: {ANTHROPIC_MODEL}")
print(f"  Token: {ANTHROPIC_AUTH_TOKEN[:10]}..." if ANTHROPIC_AUTH_TOKEN else "  Token: NOT SET")
print()

async def test_with_anthropic_client():
    """Test using AsyncAnthropic client."""
    from anthropic import AsyncAnthropic

    print("Testing with AsyncAnthropic client...")
    client = AsyncAnthropic(
        api_key=ANTHROPIC_AUTH_TOKEN,
        base_url=ANTHROPIC_BASE_URL
    )

    start = time.time()
    try:
        response = await asyncio.wait_for(
            client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=50,
                messages=[{"role": "user", "content": "Say hello"}]
            ),
            timeout=60.0
        )
        elapsed = time.time() - start
        print(f"  SUCCESS in {elapsed:.2f}s")
        print(f"  Response: {response.content[0].text[:100]}")
    except asyncio.TimeoutError:
        elapsed = time.time() - start
        print(f"  TIMEOUT after {elapsed:.2f}s")
    except Exception as e:
        elapsed = time.time() - start
        print(f"  ERROR after {elapsed:.2f}s: {type(e).__name__}: {e}")

async def test_with_httpx():
    """Test raw HTTP request to see what's happening."""
    import httpx

    print("\nTesting with raw httpx request...")
    url = f"{ANTHROPIC_BASE_URL}/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_AUTH_TOKEN,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 50,
        "messages": [{"role": "user", "content": "Say hello"}]
    }

    start = time.time()
    try:
        async with httpx.AsyncClient(verify=False, timeout=60.0) as client:
            print(f"  Sending POST to {url}")
            response = await client.post(url, headers=headers, json=payload)
            elapsed = time.time() - start
            print(f"  Status: {response.status_code} in {elapsed:.2f}s")
            print(f"  Response: {response.text[:500]}")
    except Exception as e:
        elapsed = time.time() - start
        print(f"  ERROR after {elapsed:.2f}s: {type(e).__name__}: {e}")

async def main():
    await test_with_httpx()
    print()
    await test_with_anthropic_client()

if __name__ == "__main__":
    asyncio.run(main())
