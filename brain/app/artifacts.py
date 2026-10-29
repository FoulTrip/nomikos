"""Convierte resultados reales de apps en artifacts compactos para el chat."""

from __future__ import annotations

from typing import Any


def _text(value: Any, limit: int) -> str:
    if isinstance(value, (str, int, float)):
        return str(value).strip()[:limit]
    return ""


def _collection(data: Any) -> tuple[list[dict], dict]:
    """Encuentra una colección paginada común sin asumir un CMS concreto."""
    root = data.get("result", data) if isinstance(data, dict) else data
    if isinstance(root, list):
        return [item for item in root if isinstance(item, dict)], {}
    if not isinstance(root, dict):
        return [], {}
    for key in ("products", "docs", "items", "results"):
        rows = root.get(key)
        if isinstance(rows, list):
            return [item for item in rows if isinstance(item, dict)], root
    nested = root.get("data")
    if isinstance(nested, dict):
        return _collection({"result": nested})
    return [], root


def _image_url(item: dict, *, is_media_tool: bool) -> str:
    sizes = item.get("sizes")
    if isinstance(sizes, dict):
        for size in ("thumbnail", "card", "small"):
            candidate = sizes.get(size)
            if isinstance(candidate, dict) and isinstance(candidate.get("url"), str):
                return candidate["url"]
    if is_media_tool and isinstance(item.get("thumbnailURL"), str):
        return item["thumbnailURL"]
    if is_media_tool and isinstance(item.get("url"), str):
        return item["url"]
    for key in ("image", "photo", "thumbnail", "featuredImage", "cover", "media"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith(("/", "https://", "http://")):
            return value
        if isinstance(value, dict):
            sizes = value.get("sizes")
            if isinstance(sizes, dict):
                for size in ("thumbnail", "card", "small"):
                    candidate = sizes.get(size)
                    if isinstance(candidate, dict) and isinstance(candidate.get("url"), str):
                        return candidate["url"]
            url = value.get("url") or value.get("src")
            if isinstance(url, str):
                return url
    for key in ("image_url", "imageUrl", "thumbnail_url", "thumbnailUrl"):
        value = item.get(key)
        if isinstance(value, str):
            return value
    return ""


def artifact_from_tool(
    tool_name: str,
    data: Any,
    x402: dict | None,
) -> dict | None:
    """Normaliza un resultado app paginado en un artifact de catálogo."""
    rows, pagination = _collection(data)
    if not rows:
        return None

    tool = tool_name.lower()
    is_product_tool = "product" in tool or "catalog" in tool
    is_media_tool = "media" in tool
    product_rows = [
        row for row in rows
        if any(key in row for key in ("price", "amount", "currency", "image", "image_url", "photo", "featuredImage"))
    ]
    # No convertir respuestas de usuarios u otras entidades en tarjetas por accidente.
    if not is_product_tool and not is_media_tool and not product_rows:
        return None
    source = rows if is_product_tool or is_media_tool else product_rows
    media = data.get("artifact_media", {}) if isinstance(data, dict) else {}

    items: list[dict] = []
    for index, row in enumerate(source[:8]):
        title = next(
            (_text(row.get(key), 120) for key in ("name", "title", "product_name", "label", "alt") if _text(row.get(key), 120)),
            _text(row.get("filename"), 120) or f"Producto {index + 1}",
        )
        description = next(
            (_text(row.get(key), 220) for key in ("description", "summary", "excerpt", "details") if _text(row.get(key), 220)),
            "",
        )
        price = row.get("price", row.get("amount"))
        if isinstance(price, dict):
            currency = _text(price.get("currency") or row.get("currency"), 8)
            price = price.get("amount", price.get("value"))
        else:
            currency = _text(row.get("currency"), 8)
        image_url = _image_url(row, is_media_tool=is_media_tool)
        image_data = media.get(image_url, "") if isinstance(media, dict) else ""
        items.append({
            "id": _text(row.get("id") or row.get("_id"), 80) or str(index),
            "title": title,
            "description": description,
            "price": _text(price, 32),
            "currency": currency,
            "image_data": image_data if isinstance(image_data, str) else "",
        })

    if not items:
        return None
    page = pagination.get("page", 1)
    total_pages = pagination.get("totalPages", pagination.get("total_pages", 1))
    total_docs = pagination.get("totalDocs", pagination.get("total_docs", len(items)))
    try:
        page = max(1, int(page))
        total_pages = max(page, int(total_pages))
        total_docs = max(len(items), int(total_docs))
    except (TypeError, ValueError):
        page, total_pages, total_docs = 1, 1, len(items)

    payment_status = (x402 or {}).get("status", "")
    return {
        "type": "catalog",
        "title": "Productos" if is_product_tool else "Galería" if is_media_tool else "Catálogo",
        "app": _text(data.get("app"), 48) if isinstance(data, dict) else "",
        "tool": tool_name[:80],
        "page": page,
        "total_pages": total_pages,
        "total_items": total_docs,
        "payment_status": payment_status,
        "items": items,
    }
