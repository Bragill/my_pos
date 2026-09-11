import { useState, useEffect } from "react";

/**
 * Shared pagination logic for all data tables.
 *
 * @param {Array} items - full (already filtered/searched) row list
 * @param {number} initialPerPage - default rows per page (10 for modals, 20 for full pages)
 * @param {any} resetKey - page jumps back to 1 whenever this value changes
 *                         (pass search text, tab id, filter object key, ...)
 */
export function usePagination(items = [], initialPerPage = 10, resetKey = "") {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initialPerPage);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paged = items.slice((safePage - 1) * perPage, safePage * perPage);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * perPage + 1;
  const rangeEnd = Math.min(safePage * perPage, total);

  const changePerPage = (n) => {
    setPerPage(n);
    setPage(1);
  };

  return {
    page: safePage,
    setPage,
    perPage,
    setPerPage: changePerPage,
    total,
    totalPages,
    paged,
    rangeStart,
    rangeEnd,
  };
}
