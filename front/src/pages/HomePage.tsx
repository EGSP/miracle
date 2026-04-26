import { useCheckHealth, useRefetchHealth } from "@/lib/queries/health.query";
import { useMemo } from "react";

export default function HomePage() {

  const { data, isLoading, error } = useCheckHealth();
  const refetchHealth = useRefetchHealth();

  const localizedTimestamp = useMemo(() => {
    return new Date(data?.timestamp ?? '').toLocaleString();
  }, [data?.timestamp]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <section>
        <h1>Miracle</h1>
        <p>Обработка опросных листов ИИ агентом</p>
      </section>
      <section>
        <h2>Проверка состояния сервера</h2>
        {isLoading && <p>Загрузка...</p>}
        {error && <p>Ошибка: {error.message}</p>}
        {data && <p>Состояние сервера: {data.status} от {localizedTimestamp}</p>}

        <button onClick={refetchHealth}>Проверить</button>
      </section>
    </main>
  );
}
