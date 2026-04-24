from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # DB
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "tixy"

    # JWT
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hrs (vendedores en campo)

    # App
    APP_NAME: str = "Tixy Glamour — Sistema de Pedidos"
    DEBUG: bool = False

    # CORS — en producción pon los dominios reales separados por coma
    # Ejemplo: "https://tixyglamour.com,https://app.tixyglamour.com"
    ALLOWED_ORIGINS: str = "*"

    # Email (Resend) — configura en Railway
    RESEND_API_KEY: str = "re_CONFIGURA_EN_RAILWAY"
    MAIL_FROM: str = "noreply@tixyglamour.com"
    MAIL_FROM_NAME: str = "Tixy Glamour"

    # URL del frontend — para generar el link de reset
    FRONTEND_URL: str = "https://app.tixyglamour.com"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )


settings = Settings()
