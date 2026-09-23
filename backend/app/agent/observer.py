"""
backend/app/agent/observer.py
==============================
Extracts the interactive element table and page text from a Playwright page.

Output is the ElementTableEvent payload: a list of Element dicts for the LLM
to reference by index when deciding the next action.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.async_api import Page

logger = logging.getLogger(__name__)

# JS that returns a JSON array of visible, interactive elements
_ELEMENT_EXTRACT_JS = """
(() => {
  const TAG_MAP = {
    INPUT: (el) => {
      const t = (el.type || '').toLowerCase();
      if (['text','email','password','search','tel','url','number'].includes(t)) return 'textbox';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      return 'textbox';
    },
    TEXTAREA: () => 'textbox',
    SELECT: () => 'combobox',
    BUTTON: () => 'button',
    A: () => 'link',
  };

  function getKind(el) {
    const role = el.getAttribute('role') || '';
    if (role) {
      if (['button','link','checkbox','radio','combobox','textbox','searchbox','spinbutton'].includes(role)) return role;
    }
    const fn = TAG_MAP[el.tagName];
    return fn ? fn(el) : 'other';
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    if (r.right < 0 || r.left > window.innerWidth) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }

  function getLabel(el) {
    if (el.ariaLabel) return el.ariaLabel.trim();
    const id = el.id;
    if (id) {
      const lbl = document.querySelector(`label[for="${id}"]`);
      if (lbl) return lbl.innerText.trim();
    }
    if (el.placeholder) return el.placeholder.trim();
    if (el.title) return el.title.trim();
    if (el.innerText) return el.innerText.trim().slice(0, 120);
    if (el.value) return el.value.trim().slice(0, 120);
    return el.tagName.toLowerCase();
  }

  const selectors = [
    'a[href]', 'button', 'input:not([type="hidden"])',
    'select', 'textarea', '[role="button"]', '[role="link"]',
    '[role="textbox"]', '[role="combobox"]', '[role="checkbox"]',
    '[role="radio"]', '[role="menuitem"]', '[role="option"]',
    '[onclick]', '[tabindex]:not([tabindex="-1"])',
  ];

  const seen = new Set();
  const results = [];
  let index = 1;
  const vp = { w: window.innerWidth, h: window.innerHeight };

  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el) || !isVisible(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      results.push({
        index,
        kind: getKind(el),
        label: getLabel(el),
        value: el.value || null,
        disabled: el.disabled || false,
        bbox: {
          x: r.left / vp.w,
          y: r.top / vp.h,
          w: r.width / vp.w,
          h: r.height / vp.h,
        },
      });
      index++;
      if (index > 80) break;  // cap at 80 elements
    }
    if (index > 80) break;
  }
  return results;
})()
"""

_TEXT_EXTRACT_JS = """
(() => {
  const body = document.body;
  if (!body) return '';
  // Remove noisy elements
  const clone = body.cloneNode(true);
  for (const tag of ['script','style','noscript','svg','img','video','audio','iframe']) {
    clone.querySelectorAll(tag).forEach(el => el.remove());
  }
  return clone.innerText.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 4000);
})()
"""


async def observe(page: Page) -> tuple[list[dict], str, str]:
    """
    Extract the interactive element table and page text from a Playwright page.

    Returns:
        (elements, page_text, page_url)
    """
    try:
        elements: list[dict] = await page.evaluate(_ELEMENT_EXTRACT_JS)
    except Exception as e:
        logger.warning("Element extraction failed: %s", e)
        elements = []

    try:
        page_text: str = await page.evaluate(_TEXT_EXTRACT_JS)
    except Exception as e:
        logger.warning("Text extraction failed: %s", e)
        page_text = ""

    page_url = page.url
    return elements, page_text, page_url
