# File Router

Роутер для загрузки файлов. Все маршруты защищены `authMiddleware`.

## POST /files/upload

Загружает файл на сервер. Файл сохраняется на диск в папку `data/uploads` под именем `{uuid}{ext}`, а его метаданные записываются в базу данных.

### Конфигурация (`FILE_UPLOAD_CONFIG`)

| Поле | Значение |
|---|---|
| `maxSizeBytes` | 50 MB |
| `allowedMimeTypes` | PDF, JPEG, PNG, DOC/DOCX, XLS/XLSX, PPT/PPTX |

### Как работает body hint для генератора клиента

Обработчик мультипарт-запроса устроен нестандартно: multer перехватывает тело запроса **до** того, как Express-body-parser успевает прочитать его. Поэтому `context.body` в handler-е не содержит файл — он доступен через `context.req.file` (multer кладёт туда объект `Express.Multer.File`).

Но генератор клиента читает **тип первого параметра** handler-а, чтобы определить аргументы клиентской функции. Поле `body` он превращает в аргумент `data` в axios-конфиге. Чтобы сгенерировать правильный клиент, в типе параметра намеренно указано `body: UploadBody` — локальный алиас для `FormData`:

```ts
// Локальный алиас — нужен только для генератора клиента.
// Генератор видит body: UploadBody → создаёт аргумент formData: FormData в клиенте.
// В рантайме handler не использует body — файл берётся из req.file.
type UploadBody = FormData;

handler: async ({ req, locals }: { req: Request; body: UploadBody; ... }) => {
    const file = req.file; // файл от multer
    ...
}
```

Сгенерированный клиент:

```ts
// front/src/lib/generated/file.client.ts
export const file = {
    uploadFile: (formData: FormData) => customInstance<UploadFileResponse>({
        method: 'POST',
        url: '/files/upload',
        data: formData,  // axios автоматически выставит Content-Type: multipart/form-data
    }),
};
```

Axios корректно обрабатывает `FormData` в `data`: автоматически выставляет заголовок `Content-Type: multipart/form-data; boundary=…`.

### Использование на фронтенде

```ts
import { useUploadFile } from '@/lib/queries/file.query';
import { FileDropZone } from '@/components/ui/file-dropzone';

// В компоненте:
const [file, setFile] = useState<File | null>(null);
const uploadMutation = useUploadFile();

const handleSubmit = () => {
    if (file) {
        uploadMutation.mutate(file);
    }
};

// В JSX:
<FileDropZone value={file} onChange={setFile} accept=".pdf,image/*" />
```

### Схема обработки загрузки

```
Frontend                     Backend                      Disk / DB
────────                     ───────                      ─────────
FormData (file)
    │
    ▼
file.uploadFile(formData)
    │
    ▼ POST /files/upload
    │                    authMiddleware (JWT cookie)
    │                         │
    │                    multer.single('file')
    │                         │ генерирует uuid
    │                         │ сохраняет файл
    │                         ▼
    │                    data/uploads/{uuid}.{ext} ──────► disk
    │                         │
    │                    filesService.create(...)
    │                         │                   ──────► data/files.json
    │                         ▼
    ◄──────── FileModel (id, name, extension, bytes, authorId)
```
