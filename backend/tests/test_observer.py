"""backend/tests/test_observer.py — unit tests for the element observer JS extractor."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# We mock the Playwright page so no real browser is needed
async def _fake_evaluate(script: str):
    """Simulate JS evaluation returning a minimal element table."""
    if "TAG_MAP" in script:  # Element extraction script
        return [
            {"index": 1, "kind": "textbox", "label": "Search", "value": "", "disabled": False,
             "bbox": {"x": 0.1, "y": 0.05, "w": 0.6, "h": 0.04}},
            {"index": 2, "kind": "button", "label": "Search Google", "value": None, "disabled": False,
             "bbox": {"x": 0.35, "y": 0.15, "w": 0.12, "h": 0.04}},
            {"index": 3, "kind": "link", "label": "Gmail", "value": None, "disabled": False,
             "bbox": {"x": 0.7, "y": 0.01, "w": 0.05, "h": 0.02}},
        ]
    else:  # Text extraction script
        return "Welcome to Google\nSearch the web"


@pytest.mark.asyncio
async def test_observe_returns_elements_and_text():
    from app.agent.observer import observe

    mock_page = MagicMock()
    mock_page.url = "https://google.com"
    mock_page.evaluate = AsyncMock(side_effect=_fake_evaluate)

    elements, page_text, url = await observe(mock_page)

    assert url == "https://google.com"
    assert len(elements) == 3
    assert elements[0]["kind"] == "textbox"
    assert elements[0]["label"] == "Search"
    assert "Welcome to Google" in page_text


@pytest.mark.asyncio
async def test_observe_handles_js_error():
    from app.agent.observer import observe

    mock_page = MagicMock()
    mock_page.url = "https://broken.example.com"
    mock_page.evaluate = AsyncMock(side_effect=Exception("JS error"))

    elements, page_text, url = await observe(mock_page)

    # Should degrade gracefully
    assert elements == []
    assert page_text == ""
    assert url == "https://broken.example.com"


@pytest.mark.asyncio
async def test_observe_normalizes_bbox():
    from app.agent.observer import observe

    mock_page = MagicMock()
    mock_page.url = "https://example.com"
    mock_page.evaluate = AsyncMock(side_effect=_fake_evaluate)

    elements, _, _ = await observe(mock_page)

    # All bbox values should be 0-1 normalized fractions
    for el in elements:
        bbox = el["bbox"]
        assert 0.0 <= bbox["x"] <= 1.0, f"x out of range: {bbox['x']}"
        assert 0.0 <= bbox["y"] <= 1.0, f"y out of range: {bbox['y']}"
        assert 0.0 <= bbox["w"] <= 1.0, f"w out of range: {bbox['w']}"
        assert 0.0 <= bbox["h"] <= 1.0, f"h out of range: {bbox['h']}"


@pytest.mark.asyncio
async def test_observe_element_kinds():
    from app.agent.observer import observe

    mock_page = MagicMock()
    mock_page.url = "https://example.com"
    mock_page.evaluate = AsyncMock(side_effect=_fake_evaluate)

    elements, _, _ = await observe(mock_page)
    kinds = {el["kind"] for el in elements}
    assert "textbox" in kinds
    assert "button" in kinds
    assert "link" in kinds
