import { useEffect, useState } from "react";
import { API_URL } from "../config";

// ---------------------------------------------------------------------------
// Types (only the fields this screen actually reads)
// ---------------------------------------------------------------------------

interface Job {
  id: number;
  hotel_id: number | null;
  file_reference: string;
  provider: string | null;
  status: string;
  contract_id: number | null;
  created_by: number | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface ExtractedFieldRow {
  id: number;
  job_id: number;
  entity_type: string;
  field_data: string;
  confidence_score: number;
  original_text: string | null;
  ai_interpretation: string | null;
  low_confidence_reason: string | null;
  created_at: string;
}

interface Hotel {
  id: number;
  hotel_name: string;
}

type Mode = "list" | "upload" | "processing" | "review";
type ProcessingStep = "starting" | "extracting" | "submitting";

const LOW_CONFIDENCE_THRESHOLD = 70; // matches backend's service.LOW_CONFIDENCE_THRESHOLD

// ---------------------------------------------------------------------------
// Fetch helper — same pattern as Reservations.tsx/HotelSearch.tsx's fetchJson
// ---------------------------------------------------------------------------

async function fetchJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail = `Ошибка запроса (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("ru-RU");
}

function parseFieldValue(fieldData: string): string {
  try {
    const parsed = JSON.parse(fieldData);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
  } catch {
    return fieldData;
  }
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Загружено",
  processing: "Обработка",
  extracted: "Извлечено",
  under_review: "На проверке",
  approved: "Одобрено",
  rejected: "Отклонено",
  failed: "Ошибка",
};

const STATUS_CLASSES: Record<string, string> = {
  uploaded: "bg-slate/10 text-slate",
  processing: "bg-coral/15 text-coral",
  extracted: "bg-teal/15 text-teal",
  under_review: "bg-coral/15 text-coral",
  approved: "bg-teal/15 text-teal",
  rejected: "bg-red-500/15 text-red-600",
  failed: "bg-red-500/15 text-red-600",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  hotel_name: "Название отеля",
  country: "Страна",
  city: "Город",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        STATUS_CLASSES[status] ?? "bg-slate/10 text-slate"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const low = score < LOW_CONFIDENCE_THRESHOLD;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        low ? "bg-coral/15 text-coral" : "bg-teal/15 text-teal"
      }`}
    >
      {low ? "Низкая уверенность" : "Высокая уверенность"} ({score}%)
    </span>
  );
}

function MockModeBanner() {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-800">
      <span className="font-semibold">⚠ Тестовый режим (Mock):</span> данные не считаны из вашего файла,
      используются фиксированные тестовые значения. Реальное распознавание PDF станет доступно после
      подключения Claude API.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Processing step checklist
// ---------------------------------------------------------------------------

function StepRow({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          state === "done"
            ? "bg-teal text-white"
            : state === "active"
              ? "animate-pulse bg-coral text-white"
              : "bg-ink/10 text-slate/40"
        }`}
      >
        {state === "done" ? "✓" : ""}
      </span>
      <span className={state === "pending" ? "text-slate/40" : "text-ink"}>{label}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const ContractsAI = () => {
  const [mode, setMode] = useState<Mode>("list");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [hotels, setHotels] = useState<Record<number, string>>({});
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // Name of the Model Router's currently-active provider (Decision 035/041)
  // -- "mock" until Claude is actually connected. Drives MockModeBanner on
  // the processing screen (what's about to run); the review screen and
  // approval message use the job's own recorded `provider` instead, since
  // that reflects what actually produced that job's data even after the
  // active provider is later switched.
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  // upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  // processing
  const [processingJobId, setProcessingJobId] = useState<number | null>(null);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("starting");
  const [processingError, setProcessingError] = useState<string | null>(null);

  // review
  const [reviewJob, setReviewJob] = useState<Job | null>(null);
  const [reviewFields, setReviewFields] = useState<ExtractedFieldRow[] | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [gateSubmitting, setGateSubmitting] = useState(false);

  async function loadJobs() {
    const token = localStorage.getItem("token") || "";
    try {
      setListLoading(true);
      setListError(null);
      const [jobsData, hotelsData] = await Promise.all([
        fetchJson<Job[]>("/ai-core-engine/jobs?limit=100", token),
        fetchJson<Hotel[]>("/hotel-engine/hotels", token),
      ]);
      setJobs(jobsData);
      const hotelMap: Record<number, string> = {};
      hotelsData.forEach((h) => (hotelMap[h.id] = h.hotel_name));
      setHotels(hotelMap);
    } catch (err: any) {
      setListError(err.message || "Ошибка загрузки списка контрактов");
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (mode === "list") loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Fetched once -- which provider the Model Router will actually dispatch
  // to next (Decision 035/041). 404 means none configured active yet; treat
  // that the same as "unknown", not an error worth surfacing here.
  useEffect(() => {
    const token = localStorage.getItem("token") || "";
    fetchJson<{ provider_name: string }>("/ai-core-engine/providers/active", token)
      .then((config) => setActiveProvider(config.provider_name))
      .catch(() => setActiveProvider(null));
  }, []);

  // Drives the upload -> processing sequence: start-processing -> run-extraction
  // -> submit-for-review, one call each, awaited in order. Since MockClaudeProvider
  // resolves instantly there's no real async work to poll here — this becomes
  // worth polling once a genuinely slow/async provider exists.
  useEffect(() => {
    if (mode !== "processing" || processingJobId === null) return;
    let cancelled = false;
    const token = localStorage.getItem("token") || "";

    (async () => {
      try {
        setProcessingStep("starting");
        await fetchJson<Job>(`/ai-core-engine/jobs/${processingJobId}/start-processing`, token, {
          method: "POST",
        });
        if (cancelled) return;

        setProcessingStep("extracting");
        await fetchJson<Job>(`/ai-core-engine/jobs/${processingJobId}/run-extraction`, token, {
          method: "POST",
        });
        if (cancelled) return;

        setProcessingStep("submitting");
        const underReview = await fetchJson<Job>(
          `/ai-core-engine/jobs/${processingJobId}/submit-for-review`,
          token,
          { method: "POST" }
        );
        if (cancelled) return;

        await openReview(underReview.id);
      } catch (err: any) {
        if (!cancelled) setProcessingError(err.message || "Не удалось обработать документ");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, processingJobId]);

  async function openReview(jobId: number) {
    setReviewError(null);
    setReviewJob(null);
    setReviewFields(null);
    setRejectOpen(false);
    setRejectReason("");
    setApproveNotes("");
    setMode("review");
    const token = localStorage.getItem("token") || "";
    try {
      const [job, fields] = await Promise.all([
        fetchJson<Job>(`/ai-core-engine/jobs/${jobId}`, token),
        fetchJson<ExtractedFieldRow[]>(`/ai-core-engine/jobs/${jobId}/fields`, token),
      ]);
      setReviewJob(job);
      setReviewFields(fields);
    } catch (err: any) {
      setReviewError(err.message || "Не удалось загрузить данные для проверки");
    }
  }

  async function handleStartUpload() {
    if (!selectedFile) {
      setUploadError("Выберите PDF-файл");
      return;
    }
    setUploadSubmitting(true);
    setUploadError(null);
    try {
      const token = localStorage.getItem("token") || "";
      const job = await fetchJson<Job>("/ai-core-engine/jobs", token, {
        method: "POST",
        body: JSON.stringify({
          file_reference: selectedFile.name,
          hotel_id: selectedHotelId ? Number(selectedHotelId) : null,
        }),
      });
      setSelectedFile(null);
      setSelectedHotelId("");
      setProcessingJobId(job.id);
      setProcessingError(null);
      setMode("processing");
    } catch (err: any) {
      setUploadError(err.message || "Не удалось создать задачу");
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function handleApprove() {
    if (!reviewJob) return;
    setGateSubmitting(true);
    setReviewError(null);
    try {
      const token = localStorage.getItem("token") || "";
      const updated = await fetchJson<Job>(`/ai-core-engine/jobs/${reviewJob.id}/approve`, token, {
        method: "POST",
        body: JSON.stringify({ notes: approveNotes.trim() || null }),
      });
      setReviewJob(updated);
      if (updated.hotel_id !== null && !(updated.hotel_id in hotels)) {
        const hotel = await fetchJson<Hotel>(`/hotel-engine/hotels/${updated.hotel_id}`, token);
        setHotels((prev) => ({ ...prev, [hotel.id]: hotel.hotel_name }));
      }
    } catch (err: any) {
      setReviewError(err.message || "Не удалось одобрить");
    } finally {
      setGateSubmitting(false);
    }
  }

  async function handleReject() {
    if (!reviewJob) return;
    if (rejectReason.trim().length < 2) {
      setReviewError("Укажите причину отклонения (минимум 2 символа)");
      return;
    }
    setGateSubmitting(true);
    setReviewError(null);
    try {
      const token = localStorage.getItem("token") || "";
      const updated = await fetchJson<Job>(`/ai-core-engine/jobs/${reviewJob.id}/reject`, token, {
        method: "POST",
        body: JSON.stringify({ notes: rejectReason.trim() }),
      });
      setReviewJob(updated);
      setRejectOpen(false);
    } catch (err: any) {
      setReviewError(err.message || "Не удалось отклонить");
    } finally {
      setGateSubmitting(false);
    }
  }

  // ===== List =====

  if (mode === "list") {
    return (
      <div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-sm text-slate/60">
            Загрузка контрактов через ИИ — извлечение данных с проверкой человеком перед сохранением
            (Decision 035).
          </p>
          <button
            type="button"
            onClick={() => {
              setUploadError(null);
              setSelectedFile(null);
              setSelectedHotelId("");
              setMode("upload");
            }}
            className="shrink-0 rounded-lg bg-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5"
          >
            Загрузить контракт
          </button>
        </div>

        {listLoading && <p className="mt-10 text-center text-sm text-slate/60">Загрузка...</p>}
        {listError && <p className="mt-10 text-center text-sm text-red-600">Ошибка: {listError}</p>}

        {!listLoading && !listError && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-slate/50">
                  <th className="px-4 py-3 font-medium">Дата</th>
                  <th className="px-4 py-3 font-medium">Файл</th>
                  <th className="px-4 py-3 font-medium">Отель</th>
                  <th className="px-4 py-3 font-medium">Провайдер</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate/50">
                      Контракты не загружены
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => openReview(job.id)}
                      className="cursor-pointer border-b border-ink/5 last:border-b-0 hover:bg-sand/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate/70">
                        {formatDate(job.created_at)}
                      </td>
                      <td className="px-4 py-3.5 font-medium text-ink">{job.file_reference}</td>
                      <td className="px-4 py-3.5 text-slate/80">
                        {job.hotel_id ? hotels[job.hotel_id] ?? `#${job.hotel_id}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-slate/70">
                        {job.provider ?? "—"}
                        {job.provider === "mock" && (
                          <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Mock
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={job.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ===== Upload =====

  if (mode === "upload") {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-ink/10 bg-white p-8">
        <h3 className="font-display text-lg font-semibold text-ink">Загрузить контракт</h3>
        <p className="mt-2 text-xs text-slate/50">
          Файл не отправляется на сервер — реального хранилища файлов в проекте пока нет (см.
          CLAUDE.md). Используется только имя файла как ссылка (file_reference).
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate/50">
              PDF-файл контракта
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3.5 file:py-2 file:text-xs file:font-medium file:text-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate/50">
              Отель (опционально)
            </label>
            <select
              value={selectedHotelId}
              onChange={(e) => setSelectedHotelId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-slate focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/30"
            >
              <option value="">Без привязки к отелю</option>
              {Object.entries(hotels).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {uploadError && (
            <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
              {uploadError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartUpload}
              disabled={uploadSubmitting}
              className="rounded-lg bg-coral px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-coral/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {uploadSubmitting ? "Отправка..." : "Начать обработку"}
            </button>
            <button
              type="button"
              onClick={() => setMode("list")}
              disabled={uploadSubmitting}
              className="rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== Processing =====

  if (mode === "processing") {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-ink/10 bg-white p-8">
        <h3 className="text-center font-display text-lg font-semibold text-ink">Обработка документа</h3>
        {activeProvider === "mock" && (
          <div className="mt-4">
            <MockModeBanner />
          </div>
        )}
        <ol className="mt-6 space-y-4">
          <StepRow label="Документ загружен" state="done" />
          <StepRow
            label="Переход в статус «Обработка»"
            state={processingStep === "starting" ? "active" : "done"}
          />
          <StepRow
            label="Извлечение данных (ИИ-провайдер)"
            state={
              processingStep === "starting" ? "pending" : processingStep === "extracting" ? "active" : "done"
            }
          />
          <StepRow label="Отправка на проверку" state={processingStep === "submitting" ? "active" : "pending"} />
        </ol>

        {processingError && (
          <div className="mt-6 space-y-3">
            <div className="rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
              {processingError}
            </div>
            <button
              type="button"
              onClick={() => setMode("list")}
              className="w-full rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand"
            >
              Назад к списку
            </button>
          </div>
        )}
      </div>
    );
  }

  // ===== Review =====

  const isUnderReview = reviewJob?.status === "under_review";

  return (
    <div className="pb-24">
      <button
        type="button"
        onClick={() => setMode("list")}
        className="mt-6 text-sm font-medium text-slate/60 hover:text-ink"
      >
        ← Назад к списку
      </button>

      {reviewError && !reviewJob && (
        <p className="mt-10 text-center text-sm text-red-600">Ошибка: {reviewError}</p>
      )}

      {reviewJob && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white p-5">
            <div>
              <h3 className="font-display text-xl font-semibold text-ink">{reviewJob.file_reference}</h3>
              <p className="mt-1 text-sm text-slate/70">
                {reviewJob.hotel_id ? hotels[reviewJob.hotel_id] ?? `#${reviewJob.hotel_id}` : "Без привязки к отелю"}
                {" · "}
                {formatDate(reviewJob.created_at)}
              </p>
            </div>
            <StatusBadge status={reviewJob.status} />
          </div>

          {reviewJob.provider === "mock" && (
            <div className="mt-4">
              <MockModeBanner />
            </div>
          )}

          <div className="mt-5 space-y-3">
            {reviewFields === null && <p className="text-sm text-slate/50">Загрузка полей...</p>}
            {reviewFields && reviewFields.length === 0 && (
              <p className="rounded-2xl border border-ink/10 bg-white p-5 text-sm text-slate/50">
                Извлечённые поля отсутствуют.
              </p>
            )}
            {reviewFields?.map((field) => {
              const low = field.confidence_score < LOW_CONFIDENCE_THRESHOLD;
              return (
                <div key={field.id} className="rounded-2xl border border-ink/10 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {ENTITY_TYPE_LABELS[field.entity_type] ?? field.entity_type}
                    </span>
                    <ConfidenceBadge score={field.confidence_score} />
                  </div>

                  {!low && (
                    <p className="mt-2 text-sm text-ink">{parseFieldValue(field.field_data)}</p>
                  )}

                  {low && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-sand/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate/50">
                          Исходный текст
                        </p>
                        <p className="mt-1 text-sm text-ink">{field.original_text || "—"}</p>
                      </div>
                      <div className="rounded-lg border border-coral/20 bg-coral/5 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-coral">
                          Интерпретация ИИ
                        </p>
                        <p className="mt-1 text-sm text-ink">{field.ai_interpretation || "—"}</p>
                        <p className="mt-1 text-sm text-ink">
                          Извлечённое значение: {parseFieldValue(field.field_data)}
                        </p>
                      </div>
                      {field.low_confidence_reason && (
                        <p className="text-xs text-slate/60 sm:col-span-2">
                          Причина низкой уверенности: {field.low_confidence_reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {reviewJob.status === "approved" && reviewJob.hotel_id !== null && (
            <div className="mt-4 space-y-2">
              <div className="rounded-lg bg-teal/10 px-4 py-3 text-sm text-teal">
                Одобрено. Создан отель: {hotels[reviewJob.hotel_id] ?? "—"} (id={reviewJob.hotel_id}) — доступен
                в поиске отелей.
              </div>
              {reviewJob.provider === "mock" && (
                <div className="rounded-lg bg-amber-400/10 px-4 py-3 text-xs text-amber-800">
                  ⚠ Название и данные отеля выше — фиксированные тестовые значения из Mock-провайдера, не
                  результат чтения вашего файла.
                </div>
              )}
            </div>
          )}
          {reviewJob.status === "approved" && reviewJob.hotel_id === null && (
            <div className="mt-4 rounded-lg bg-slate/10 px-4 py-3 text-sm text-slate">
              Одобрено (запись в Contract Engine создана до появления автозаписи — привяжите отель вручную).
            </div>
          )}
          {reviewJob.status === "failed" && (
            <div className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600">
              Не удалось записать в Contract Engine: {reviewJob.failure_reason ?? "причина не указана"}
            </div>
          )}
          {reviewJob.status === "rejected" && (
            <div className="mt-4 rounded-lg bg-slate/10 px-4 py-3 text-sm text-slate">Отклонено.</div>
          )}
        </>
      )}

      {isUnderReview && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="mx-auto max-w-[1400px]">
            {reviewError && (
              <div className="mb-3 rounded-lg bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
                {reviewError}
              </div>
            )}
            {rejectOpen ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <textarea
                  placeholder="Причина отклонения *"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={1}
                  className="min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={gateSubmitting}
                  className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-red-600/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {gateSubmitting ? "Отправка..." : "Подтвердить отклонение"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectOpen(false);
                    setReviewError(null);
                  }}
                  disabled={gateSubmitting}
                  className="rounded-lg border border-ink/15 bg-white px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отмена
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="text"
                  placeholder="Комментарий к одобрению (опционально)"
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  className="min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-slate placeholder:text-slate/40 focus:border-coral focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={gateSubmitting}
                  className="rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-teal/30 transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {gateSubmitting ? "Отправка..." : "Одобрить"}
                </button>
                <button
                  type="button"
                  onClick={() => setRejectOpen(true)}
                  disabled={gateSubmitting}
                  className="rounded-lg border border-red-500/30 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Отклонить
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractsAI;
