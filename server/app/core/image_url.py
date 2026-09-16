"""One rule for every operator-supplied image URL in the product.

WHY THIS EXISTS. `businesses.image` and `users.avatar` are URLs somebody pastes
into a settings form, and both are rendered with `next/image`. A remote host that
`next.config.ts` does not declare made the PUBLIC booking page return 500 — a
guest page taken down by a value an operator typed. The render side now degrades
to the venue's designed no-image state (`client/hooks/use-tenant-image.ts`), but
degrading silently is only half an answer: the owner should learn the link is
unusable in the form where they can fix it, not from a guest.

The `https`-or-same-origin rule is deliberately the rule the venue's privacy gate
already applies to its policy URL (`app/core/public_access.has_privacy_contact`),
using the same `urlparse` primitive. This is an existing rule reused, not a new
one — and it is what keeps `javascript:`, `data:` and protocol-relative `//host`
out of an `src` attribute on a public page.

Relative `/`-prefixed paths stay legal: they are served by the app itself, need no
`next/image` configuration at all, and the demo seed is expected to use one.
"""

from urllib.parse import urlparse

IMAGE_URL_MESSAGE = "Image must be an https:// link, or a path beginning with /"


def validate_image_url(value: str | None) -> str | None:
    """Return the stored form of an operator-supplied image URL, or raise.

    Raises `ValueError(IMAGE_URL_MESSAGE)`; each caller maps that to its own
    422 so the operator's toast carries the sentence rather than a generic
    "Request validation failed".

    Normalises two things on the way through, both load-bearing rather than
    tidying: surrounding whitespace is stripped, because a pasted URL routinely
    carries it and `next/image` rejects a `src` that starts or ends with one;
    and a cleared field stores NULL rather than "", which is the value every
    render site's `{business.image && ...}` guard already treats as absent.
    """
    if value is None:
        return None

    candidate = value.strip()
    if not candidate:
        return None

    # A same-origin path. `//host/x.jpg` is protocol-relative, not a path, and
    # would inherit the page's scheme to reach an arbitrary host.
    if candidate.startswith("/"):
        if candidate.startswith("//"):
            raise ValueError(IMAGE_URL_MESSAGE)
        return candidate

    parsed = urlparse(candidate)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(IMAGE_URL_MESSAGE)
    return candidate
