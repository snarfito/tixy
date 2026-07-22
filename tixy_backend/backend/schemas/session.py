from datetime import datetime

from pydantic import BaseModel


class SessionOut(BaseModel):
    id:             int
    user_id:        int
    user_full_name: str
    user_email:     str
    device_label:   str
    ip_address:     str
    created_at:     datetime
    last_seen_at:   datetime
