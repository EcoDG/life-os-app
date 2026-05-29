/**
 * SamsungHealthAnalyzer
 *
 * 삼성헬스 스크린샷 2장(수면 단계 + 에너지 점수)을 업로드하면
 * Claude Vision API로 분석 후 Energy Score와 분석 결과 카드를 표시합니다.
 */
import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Upload,
  Zap,
  Moon,
  Brain,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  energy_score: number;
  sleep_quality: "good" | "ok" | "bad";
  metrics: {
    deep_sleep_pct: number;
    wake_pct: number;
    rem_pct: number;
    light_pct: number;
    heart_rate: number;
    hrv: number;
    samsung_score: number;
  };
  key_issues: string[];
  one_line: string;
  suggestion: string;
  date: string;
}

interface Props {
  date: string;
  onApply: (result: AnalysisResult) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/jpeg;base64,XXXX" → "XXXX"
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getMimeType(file: File): "image/jpeg" | "image/png" | "image/webp" {
  if (file.type === "image/png") return "image/png";
  if (file.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

function energyScoreColor(score: number) {
  if (score >= 4) return "text-emerald-400";
  if (score === 3) return "text-amber-400";
  return "text-rose-400";
}

function energyScoreLabel(score: number) {
  if (score >= 5) return "최상";
  if (score === 4) return "좋음";
  if (score === 3) return "보통";
  if (score === 2) return "낮음";
  return "매우 낮음";
}

function sleepQualityBadge(q: string) {
  if (q === "good") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">수면 양호</Badge>;
  if (q === "ok") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">수면 보통</Badge>;
  return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">수면 불량</Badge>;
}

// ─── ImageUploadBox ────────────────────────────────────────────────────────────

function ImageUploadBox({
  label,
  icon: Icon,
  file,
  preview,
  onSelect,
  disabled,
}: {
  label: string;
  icon: React.ElementType;
  file: File | null;
  preview: string | null;
  onSelect: (f: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed transition-all",
        "min-h-[140px] gap-2 p-3 text-sm",
        preview
          ? "border-teal-500/60 bg-teal-500/5"
          : "border-white/20 bg-white/5 hover:border-teal-400/50 hover:bg-white/10",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
        disabled={disabled}
      />
      {preview ? (
        <>
          <img
            src={preview}
            alt={label}
            className="max-h-[100px] rounded-lg object-contain"
          />
          <span className="text-xs text-teal-400 font-medium">{file?.name}</span>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-white/50" />
          </div>
          <span className="text-white/60 text-center leading-snug">{label}</span>
          <span className="text-white/30 text-xs">탭하여 이미지 선택</span>
        </>
      )}
    </button>
  );
}

// ─── MetricRow ────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  unit,
  normal,
  warn,
}: {
  label: string;
  value: number;
  unit: string;
  normal: string;
  warn: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-white/60">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("font-mono font-semibold", warn ? "text-rose-400" : "text-white/90")}>
          {value}{unit}
        </span>
        <span className="text-white/30 text-xs">({normal})</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SamsungHealthAnalyzer({ date, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [sleepFile, setSleepFile] = useState<File | null>(null);
  const [energyFile, setEnergyFile] = useState<File | null>(null);
  const [sleepPreview, setSleepPreview] = useState<string | null>(null);
  const [energyPreview, setEnergyPreview] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [applied, setApplied] = useState(false);

  const analyze = trpc.health.analyzeScreenshot.useMutation();

  const handleSleepSelect = (f: File) => {
    setSleepFile(f);
    setSleepPreview(URL.createObjectURL(f));
    setResult(null);
    setApplied(false);
  };

  const handleEnergySelect = (f: File) => {
    setEnergyFile(f);
    setEnergyPreview(URL.createObjectURL(f));
    setResult(null);
    setApplied(false);
  };

  const handleAnalyze = async () => {
    if (!sleepFile || !energyFile) return;
    try {
      const [sleepB64, energyB64] = await Promise.all([
        fileToBase64(sleepFile),
        fileToBase64(energyFile),
      ]);
      const res = await analyze.mutateAsync({
        sleepImageBase64: sleepB64,
        energyImageBase64: energyB64,
        sleepImageMime: getMimeType(sleepFile),
        energyImageMime: getMimeType(energyFile),
        date,
      });
      setResult(res as AnalysisResult);
    } catch (err) {
      console.error("Analysis failed:", err);
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApply(result);
    setApplied(true);
  };

  const canAnalyze = !!sleepFile && !!energyFile && !analyze.isPending;

  return (
    <div className="mb-4">
      {/* 토글 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all",
          "text-sm font-medium",
          open
            ? "border-teal-500/50 bg-teal-500/10 text-teal-300"
            : "border-white/15 bg-white/5 text-white/70 hover:border-teal-400/40 hover:text-white/90"
        )}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" />
          <span>삼성헬스 AI 분석</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-500/40 text-teal-400">
            선택사항
          </Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* 패널 */}
      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <p className="text-xs text-white/50 leading-relaxed">
            삼성헬스 앱에서 <strong className="text-white/70">수면 단계</strong> 화면과{" "}
            <strong className="text-white/70">에너지 점수</strong> 화면을 스크린샷으로 찍어 업로드하세요.
            AI가 실제 회복도를 과학적으로 분석합니다.
          </p>

          {/* 이미지 업로드 */}
          <div className="grid grid-cols-2 gap-3">
            <ImageUploadBox
              label="수면 단계 화면"
              icon={Moon}
              file={sleepFile}
              preview={sleepPreview}
              onSelect={handleSleepSelect}
              disabled={analyze.isPending}
            />
            <ImageUploadBox
              label="에너지 점수 화면"
              icon={Zap}
              file={energyFile}
              preview={energyPreview}
              onSelect={handleEnergySelect}
              disabled={analyze.isPending}
            />
          </div>

          {/* 분석 버튼 */}
          {!result && (
            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40"
            >
              {analyze.isPending ? (
                <span className="flex items-center gap-2">
                  <Spinner className="w-4 h-4" />
                  AI 분석 중...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  AI 컨디션 분석
                </span>
              )}
            </Button>
          )}

          {/* 에러 */}
          {analyze.isError && (
            <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>분석 실패: {analyze.error.message}</span>
            </div>
          )}

          {/* 결과 카드 */}
          {result && (
            <div className="space-y-3">
              {/* 점수 비교 헤더 */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-white/40 mb-1">삼성헬스 점수</p>
                    <p className="text-2xl font-bold text-white/60">
                      {result.metrics.samsung_score > 0 ? result.metrics.samsung_score : "—"}
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">참고용</p>
                  </CardContent>
                </Card>
                <Card className="bg-teal-500/10 border-teal-500/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-teal-400/70 mb-1">AI 판단 에너지</p>
                    <p className={cn("text-2xl font-bold", energyScoreColor(result.energy_score))}>
                      {result.energy_score}
                      <span className="text-base font-normal text-white/40">/5</span>
                    </p>
                    <p className={cn("text-xs mt-0.5", energyScoreColor(result.energy_score))}>
                      {energyScoreLabel(result.energy_score)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* 한 줄 요약 */}
              <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                <p className="text-sm text-white/80 leading-relaxed">{result.one_line}</p>
                <div className="flex items-center gap-2 mt-2">
                  {sleepQualityBadge(result.sleep_quality)}
                </div>
              </div>

              {/* 핵심 이슈 */}
              {result.key_issues.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-white/40 font-medium uppercase tracking-wide">핵심 이슈</p>
                  {result.key_issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 오늘 제안 */}
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <p className="text-xs text-amber-400/70 font-medium mb-1">오늘의 제안</p>
                <p className="text-sm text-amber-200/80">{result.suggestion}</p>
              </div>

              {/* 수면 지표 상세 */}
              <details className="group">
                <summary className="text-xs text-white/40 cursor-pointer hover:text-white/60 transition-colors list-none flex items-center gap-1">
                  <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                  수면 지표 상세 보기
                </summary>
                <div className="mt-2 rounded-lg bg-white/5 border border-white/10 p-3 divide-y divide-white/5">
                  <MetricRow label="깊은 수면" value={result.metrics.deep_sleep_pct} unit="%" normal="10-20%" warn={result.metrics.deep_sleep_pct < 10} />
                  <MetricRow label="각성 시간" value={result.metrics.wake_pct} unit="%" normal="0-9%" warn={result.metrics.wake_pct >= 15} />
                  <MetricRow label="렘 수면" value={result.metrics.rem_pct} unit="%" normal="20-30%" warn={result.metrics.rem_pct < 15} />
                  <MetricRow label="얕은 수면" value={result.metrics.light_pct} unit="%" normal="40-60%" warn={false} />
                  <MetricRow label="수면 중 심박수" value={result.metrics.heart_rate} unit="bpm" normal="50-70bpm" warn={result.metrics.heart_rate > 70} />
                  <MetricRow label="HRV" value={result.metrics.hrv} unit="ms" normal="40ms+" warn={result.metrics.hrv < 40} />
                </div>
              </details>

              {/* 적용 버튼 */}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  onClick={handleApply}
                  disabled={applied}
                  className={cn(
                    "flex-1 transition-all",
                    applied
                      ? "bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 cursor-default"
                      : "bg-teal-600 hover:bg-teal-500 text-white"
                  )}
                >
                  {applied ? (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      적용됨
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      에너지 점수에 적용
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setApplied(false);
                    setSleepFile(null);
                    setEnergyFile(null);
                    setSleepPreview(null);
                    setEnergyPreview(null);
                  }}
                  className="border-white/20 text-white/60 hover:text-white/90 bg-transparent"
                >
                  다시 분석
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
