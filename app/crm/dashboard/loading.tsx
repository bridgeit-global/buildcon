import {
  CrmChartSkeleton,
  CrmKpiGridSkeleton
} from '../_components/crm-skeletons';

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <CrmKpiGridSkeleton count={4} cols={4} />
      <CrmKpiGridSkeleton count={4} cols={4} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 h-5 w-40 animate-pulse rounded-md bg-ds-gray-100" />
            <CrmChartSkeleton />
          </div>
          <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 h-5 w-48 animate-pulse rounded-md bg-ds-gray-100" />
            <CrmChartSkeleton />
          </div>
        </div>
        <div className="rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 h-5 w-36 animate-pulse rounded-md bg-ds-gray-100" />
          <CrmChartSkeleton className="h-[280px]" />
        </div>
      </div>
    </div>
  );
}
