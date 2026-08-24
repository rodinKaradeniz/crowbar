"""Shell-free container entry point with Railway-compatible port binding."""

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",  # nosec B104 -- container ingress must bind externally
        port=int(os.getenv("PORT", "8001")),
    )


if __name__ == "__main__":
    main()
