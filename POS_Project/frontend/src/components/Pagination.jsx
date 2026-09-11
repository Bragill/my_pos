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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 py-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <label className="font-medium whitespace-nowrap">แสดงหน้าละ</label>
        <select
          value={perPage}
          onChange={(e) => onPerPageChange(parseInt(e.target.value, 10))}
          className="bg-white border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-gray-800 font-bold focus:outline-none focus:border-indigo-500"
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
          className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 disabled:opacity-40 transition-all"
        >
          ‹ ก่อนหน้า
        </button>
        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
          หน้า {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 disabled:opacity-40 transition-all"
        >
          ถัดไป ›
        </button>
      </div>
    </div>
  );
}
