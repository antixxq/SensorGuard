import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI

from .config import database_path
from .database import Base, connect
from .routers import router
from .services import initialize, simulator


def create_app(path: Path | None = None, run_simulator: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        factory = connect(path or database_path())
        app.state.factory = factory
        Base.metadata.create_all(factory.kw["bind"])
        initialize(factory)
        task = asyncio.create_task(simulator(factory)) if run_simulator else None
        try:
            yield
        finally:
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            factory.kw["bind"].dispose()

    app = FastAPI(
        title="SensorGuard API",
        version="1.0.0",
        lifespan=lifespan,
        description="Local IoT monitoring. DEMO data is synthetic. All timestamps are UTC.",
    )
    app.include_router(router)
    return app


app = create_app()
