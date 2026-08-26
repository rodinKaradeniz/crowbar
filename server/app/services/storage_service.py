import os
import uuid
from abc import ABC, abstractmethod

from app.config import settings


class StorageService(ABC):
    @abstractmethod
    async def upload(self, file_path: str, file_data: bytes) -> str:
        pass

    @abstractmethod
    async def download(self, file_path: str) -> bytes:
        pass

    @abstractmethod
    async def delete(self, file_path: str) -> bool:
        pass


class LocalStorageService(StorageService):
    def __init__(self, base_dir: str | None = None):
        self.base_dir = base_dir or settings.upload_dir

    async def upload(self, file_path: str, file_data: bytes) -> str:
        full_path = os.path.join(self.base_dir, file_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)

        with open(full_path, "wb") as f:
            f.write(file_data)

        return f"/uploads/{file_path}"

    async def download(self, file_path: str) -> bytes:
        clean_path = file_path.removeprefix("/uploads/")
        full_path = os.path.join(self.base_dir, clean_path)
        # Refuse to read outside the upload root even if a stored key is
        # malformed; object keys are generated, but a read primitive should not
        # depend on that to stay contained.
        if os.path.commonpath([os.path.realpath(full_path), os.path.realpath(self.base_dir)]) != os.path.realpath(self.base_dir):
            raise FileNotFoundError(file_path)
        with open(full_path, "rb") as f:
            return f.read()

    async def delete(self, file_path: str) -> bool:
        # Strip leading /uploads/ if present
        clean_path = file_path.removeprefix("/uploads/")
        full_path = os.path.join(self.base_dir, clean_path)

        if os.path.exists(full_path):
            os.remove(full_path)
            return True
        return False


class S3StorageService(StorageService):
    async def upload(self, file_path: str, file_data: bytes) -> str:
        raise NotImplementedError("S3 storage not yet configured")

    async def download(self, file_path: str) -> bytes:
        raise NotImplementedError("S3 storage not yet configured")

    async def delete(self, file_path: str) -> bool:
        raise NotImplementedError("S3 storage not yet configured")


def get_storage_service() -> StorageService:
    if settings.storage_type == "s3":
        return S3StorageService()
    return LocalStorageService()


def generate_upload_path(directory: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    return os.path.join(directory, unique_name)
