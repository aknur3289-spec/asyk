import os
from functools import lru_cache
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Initialize and cache the Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError(
            "Missing required environment variables: SUPABASE_URL and SUPABASE_KEY must be set."
        )
    return create_client(SUPABASE_URL, SUPABASE_KEY)
