import { useCheckHealth, useRefetchHealth } from "@/lib/queries/health.query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

export default function HomePage() {

  const { data, isLoading, error } = useCheckHealth();
  const refetchHealth = useRefetchHealth();

  const localizedTimestamp = useMemo(() => {
    return new Date(data?.timestamp ?? '').toLocaleString();
  }, [data?.timestamp]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-8">
      <div className="w-full space-y-6">
        <div className="space-y-1">
          <h1>Miracle</h1>
          <p>Обработка опросных листов ИИ агентом</p>
        </div>

        <section className="space-y-3">
          <h2>Проверка состояния сервера</h2>
          <div>
            {isLoading && <p>Загрузка...</p>}
            {error && <p>Ошибка: {error.message}</p>}
            {data && (
              <p>
                Состояние сервера: {data.status} от {localizedTimestamp}
              </p>
            )}
          </div>
          <Button onClick={refetchHealth}>Проверить</Button>
        </section>

        <section className="space-y-2">
          <h2>Быстрый старт</h2>
          <p>Перейдите к странице входа и регистрации.</p>
          <Link to="/auth">Авторизация</Link>
        </section>
      </div>
    </main>
  );
}
