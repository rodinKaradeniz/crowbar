"""Shell-free container entry point that binds the port a host passes in $PORT."""

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
