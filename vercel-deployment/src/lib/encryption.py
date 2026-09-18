"""Encryption utilities for API key storage"""
from __future__ import annotations

import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

_ENCRYPTION_KEY = None


def get_encryption_key() -> bytes:
    """Get or derive the encryption key from environment"""
    global _ENCRYPTION_KEY
    
    if _ENCRYPTION_KEY is not None:
        return _ENCRYPTION_KEY
    
    key_b64 = os.environ.get("ENCRYPTION_KEY")
    if not key_b64:
        # Generate a key for development (NOT for production!)
        import secrets
        key_b64 = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
        print(f"⚠️  Generated temporary ENCRYPTION_KEY: {key_b64}")
        print("   Set ENCRYPTION_KEY in production!")
    
    try:
        _ENCRYPTION_KEY = base64.urlsafe_b64decode(key_b64)
    except Exception:
        # Derive from password if not valid base64
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'multillm-salt',  # In production, use per-user salt
            iterations=100000,
        )
        _ENCRYPTION_KEY = base64.urlsafe_b64encode(kdf.derive(key_b64.encode()))
    
    return _ENCRYPTION_KEY


def encrypt_api_key(api_key: str) -> str:
    """Encrypt an API key for storage"""
    key = get_encryption_key()
    f = Fernet(key)
    return f.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted_key: str) -> str:
    """Decrypt an API key from storage"""
    key = get_encryption_key()
    f = Fernet(key)
    return f.decrypt(encrypted_key.encode()).decode()


def generate_encryption_key() -> str:
    """Generate a new encryption key (run once and store securely)"""
    import secrets
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()


if __name__ == "__main__":
    # Generate a key for setup
    print(f"ENCRYPTION_KEY={generate_encryption_key()}")