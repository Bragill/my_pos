/**
 * Shared pagination footer: rows-per-page dropdown, range text,
 * prev/next buttons and page indicator.
 * Light-theme classes auto-convert to dark via the global html.dark CSS.
 */
export default function Pagination({
  page,
  totalPages,
  perPage,
  onPageChange,
  onPerPageChange,
  rangeStart,
  rangeEnd,
  total,
  perPageOptions = [10, 20, 50, 100],
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 py-3 text-gray-500 dark:text-slate-400">
      <div className="flex items-center gap-2 text-xs">
        <label className="font-medium whitespace-nowrap">แสดงหน้าละ</label>
        <select
          value={perPage}
          onChange={(e) => onPerPageChange(parseInt(e.target.value, 10))}
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-xs text-gray-800 dark:text-slate-200 font-bold focus:outline-none focus:border-indigo-500"
        >
          {perPageOptions.map((n) => (
            <option key={n} value={n}>{n} รายการ</option>
          ))}
        </select>
        <span className="whitespace-nowrap">
          {rangeStart}–{rangeEnd} จาก {total} รายการ
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-all cursor-pointer"
        >
          ‹ ก่อนหน้า
        </button>
        <span className="text-xs font-medium whitespace-nowrap">
          หน้า {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 transition-all cursor-pointer"
        >
          ถัดไป ›
        </button>
      </div>
    </div>
  );
}
