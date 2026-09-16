"""Appwrite client for Python functions"""
from __future__ import annotations

import os
from functools import lru_cache

try:
    from appwrite.client import Client
    from appwrite.services.databases import Databases
    from appwrite.services.functions import Functions
    from appwrite.services.storage import Storage
    from appwrite.query import Query
except ImportError:
    Client = None
    Databases = None
    Functions = None
    Storage = None
    Query = None


@lru_cache(maxsize=1)
def get_appwrite_client() -> Client:
    """Get configured Appwrite client"""
    if Client is None:
        raise RuntimeError("appwrite package not installed. Run: pip install appwrite")
    
    client = Client()
    client.set_endpoint(os.environ.get("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1"))
    client.set_project(os.environ.get("APPWRITE_PROJECT_ID", ""))
    client.set_key(os.environ.get("APPWRITE_API_KEY", ""))
    return client


def get_databases() -> Databases:
    return Databases(get_appwrite_client())


def get_functions() -> Functions:
    return Functions(get_appwrite_client())


def get_storage() -> Storage:
    return Storage(get_appwrite_client())


DATABASE_ID = "multi-llm"
COLLECTIONS = {
    "users": "users",
    "api_keys": "api_keys",
    "queries": "queries",
    "training_jobs": "training_jobs",
    "subscriptions": "subscriptions",
}

BUCKETS = {
    "model_artifacts": "model-artifacts",
    "knowledge_sources": "knowledge-sources",
}