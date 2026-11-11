import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast.js";
import { useSettings } from "@/hooks/useSettingService.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { IProjectService } from "@/project-sidebar/contract.js";

export interface ProjectRestoreCandidate {
  path: string;
  name: string;
  taskCount: number;
  lastActivityAt: number;
}

/**
 * 项目恢复引导（specs/project-restore-guide.md）的可见性与一键恢复状态机。
 * 可见性四条件：目录首读完成（非 loading/error）、本地未删项目为 0、
 * 未写 projectRestoreGuideDismissed、候选目录非空（为空不写标记，零成本重评）。
 * 只读派生；本地项目为空的瞬态投影不触发（localUsageEvidence 误弹事故教训）。
 * 入参用布尔而非数组：侧栏 projects 每次渲染都是新身份，数组依赖会让查询 effect 死循环。
 * 恢复为一键全量（2026-11-10 拍板）：点击卡片即确认全部候选；restoreProjects 失败不写
 * 标记可重试（命令幂等）；成功写一次性标记并回调 onRestored 刷新树，卡片随项目非空自然消失。
 */
export function useProjectRestoreGuide(input: {
  service: IProjectService | undefined;
  loading: boolean;
  error: string | null;
  localProjectsEmpty: boolean;
  onRestored(): void;
}) {
  const { settings, update } = useSettings();
  const { intl } = useZCodeIntl();
  const dismissed = settings?.projectRestoreGuideDismissed === true;
  const eligible = !dismissed && !input.loading && !input.error && input.localProjectsEmpty;
  const [candidates, setCandidates] = useState<ProjectRestoreCandidate[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  useEffect(() => {
    if (!eligible || !input.service) {
      setCandidates(null);
      return;
    }
    let current = true;
    // 查询失败按无候选处理：引导是附加能力，不能因它打断侧栏。
    input.service.listRestoreCandidates().then(
      (list) => {
        if (current) setCandidates(list);
      },
      () => {
        if (current) setCandidates([]);
      },
    );
    return () => {
      current = false;
    };
    // 依赖只收基元：项目从 0→N 或 N→0 的翻转由 localProjectsEmpty 捕捉；
    // 项目持续为空期间的任务增减不重查（一次性引导可接受的陈旧度）。
  }, [eligible, input.service]);
  const onRestoredRef = useRef(input.onRestored);
  onRestoredRef.current = input.onRestored;
  const visible = eligible && (candidates?.length ?? 0) > 0;
  const restore = useCallback(async () => {
    if (!input.service || !candidates?.length || restoring) return;
    setRestoring(true);
    try {
      const result = await input.service.restoreProjects({
        paths: candidates.map((candidate) => candidate.path),
      });
      // 修复（2026-11-11 装包实测 bug 1/2）：跳过的死目录不构成失败——能恢复的已全部恢复，
      // 标记照写；否则卡片会为一个永远无法恢复的目录死循环。跳过明细只 toast 告知，
      // 对应任务保留任务区（合法未归类，I17）。
      if (result.skipped.length > 0) {
        toast(
          intl.formatMessage(
            { id: "projectRestore.restoreSkipped" },
            { count: result.skipped.length },
          ),
        );
      }
      await update({ projectRestoreGuideDismissed: true });
      onRestoredRef.current();
    } catch (cause) {
      // 不写标记不关闭：restoreProjects 幂等，修正后可直接重试。
      setRestoreError(String(cause));
    } finally {
      setRestoring(false);
    }
  }, [candidates, input.service, intl, restoring, update]);
  const dismiss = useCallback(() => update({ projectRestoreGuideDismissed: true }), [update]);
  return {
    visible,
    candidates: visible ? candidates! : [],
    count: visible ? candidates!.reduce((sum, candidate) => sum + candidate.taskCount, 0) : 0,
    restoring,
    restoreError: visible ? restoreError : null,
    restore,
    dismiss,
  };
}
