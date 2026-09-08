import { useState } from 'react';

const BULK_UNITS = [
  { label: 'กรัม (g)', value: 'g', factor: 1 },
  { label: 'กิโลกรัม (kg)', value: 'kg', factor: 1000 },
  { label: 'มิลลิลิตร (ml)', value: 'ml', factor: 1 },
  { label: 'ลิตร (L)', value: 'L', factor: 1000 },
  { label: 'ชิ้น (pcs)', value: 'pcs', factor: 1 },
  { label: 'ออนซ์ (oz)', value: 'oz', factor: 1 },
  { label: 'แผ่น (sheet)', value: 'sheet', factor: 1 },
  { label: 'ถุง/แพ็ค (bag)', value: 'bag', factor: 1 },
];

export default function WeightUnitCalculator({ onApplyCost, defaultUnit = 'g' }) {
  const [open, setOpen] = useState(false);
  const [packagePrice, setPackagePrice] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkUnit, setBulkUnit] = useState(defaultUnit === 'g' ? 'kg' : defaultUnit === 'ml' ? 'L' : defaultUnit);
  const [baseUnit, setBaseUnit] = useState(defaultUnit);
  const [applied, setApplied] = useState(false);

  const price = parseFloat(packagePrice) || 0;
  const amount = parseFloat(bulkAmount) || 0;

  const selectedBulkUnitObj = BULK_UNITS.find(u => u.value === bulkUnit) || BULK_UNITS[0];
  
  // Calculate total base quantity (e.g., 1 kg -> 1000 g if baseUnit is g)
  let multiplier = selectedBulkUnitObj.factor;
  if (bulkUnit === 'kg' && baseUnit === 'g') multiplier = 1000;
  if (bulkUnit === 'L' && baseUnit === 'ml') multiplier = 1000;
  if (bulkUnit === baseUnit) multiplier = 1;

  const totalBaseUnits = amount * multiplier;
  const costPerUnit = totalBaseUnits > 0 ? price / totalBaseUnits : 0;

  const handleApply = () => {
    if (costPerUnit <= 0) return;
    onApplyCost(parseFloat(costPerUnit.toFixed(4)), baseUnit);
    setApplied(true);
    setOpen(false);
  };

  const handleReset = () => {
    setApplied(false);
    setPackagePrice('');
    setBulkAmount('');
    setOpen(false);
  };

  return (
    <div className="col-span-2 mt-2">
      <button
        type="button"
        onClick={() => { if (!applied) setOpen(o => !o); }}
        className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all ${
          applied
            ? 'border-emerald-300 text-emerald-700 bg-emerald-50 cursor-default'
            : 'border-indigo-300 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100'
        }`}
      >
        <span>{applied ? '🔒' : '⚖️'}</span>
        {applied 
          ? `คำนวณต้นทุนต่อหน่วยแล้ว (฿${costPerUnit.toFixed(4)} / ${baseUnit})` 
          : 'คำนวณต้นทุนต่อหน่วยจากน้ำหนัก / ปริมาตร (Weight & Volume Cost Calculator)'}
        {!applied && <span className="text-slate-400 ml-1">{open ? '▲' : '▼'}</span>}
      </button>

      {applied && (
        <button
          type="button"
          onClick={handleReset}
          className="ml-2 text-xs text-slate-400 hover:text-rose-600 underline transition-colors"
        >
          ยกเลิกล็อก
        </button>
      )}

      {open && !applied && (
        <div className="mt-2.5 rounded-2xl p-4 space-y-3 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 border-2 border-indigo-200 shadow-sm">
          <div className="flex justify-between items-center border-b border-indigo-100 pb-2">
            <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <span>⚖️</span> เครื่องมือคำนวณต้นทุนต่อหน่วยวัตถุดิบ (Unit Cost Calculator)
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">ราคารวมที่ซื้อมา (บาท)</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="เช่น 250"
                value={packagePrice}
                onChange={(e) => setPackagePrice(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">ปริมาณ / น้ำหนักรวม</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="เช่น 1 หรือ 500"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">หน่วยของแพ็คที่ซื้อ</label>
              <select
                value={bulkUnit}
                onChange={(e) => setBulkUnit(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-medium bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {BULK_UNITS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="text-xs font-semibold text-slate-700">หน่วยนับย่อยเป้าหมาย (Base Unit):</label>
            <select
              value={baseUnit}
              onChange={(e) => setBaseUnit(e.target.value)}
              className="px-3 py-1 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-800 bg-white"
            >
              <option value="g">กรัม (g)</option>
              <option value="ml">มิลลิลิตร (ml)</option>
              <option value="pcs">ชิ้น (pcs)</option>
              <option value="oz">ออนซ์ (oz)</option>
              <option value="kg">กิโลกรัม (kg)</option>
              <option value="L">ลิตร (L)</option>
            </select>
          </div>

          {totalBaseUnits > 0 && price > 0 && (
            <div className="rounded-xl bg-white border border-indigo-100 p-3 space-y-1.5 shadow-inner">
              <div className="flex justify-between text-xs text-slate-600">
                <span>ปริมาณรวมสุทธิ:</span>
                <span className="font-bold text-slate-800">{totalBaseUnits.toLocaleString()} {baseUnit}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>ราคารวมทั้งหมด:</span>
                <span className="font-bold text-slate-800">฿{price.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-indigo-50">
                <span className="text-xs font-bold text-indigo-900">ต้นทุนคำนวณต่อหน่วย:</span>
                <span className="text-base font-extrabold text-indigo-600">
                  ฿{costPerUnit.toFixed(4)} / {baseUnit}
                </span>
              </div>
              <button
                type="button"
                onClick={handleApply}
                className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100"
              >
                นำไปใช้เป็นราคาต้นทุนต่อหน่วย (฿{costPerUnit.toFixed(4)} / {baseUnit})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
