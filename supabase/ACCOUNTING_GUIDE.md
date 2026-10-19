Receipt Pilot accounting schema guide

Migration 012 adds:
- public.customer_payments: new receipt payments only. Does not backfill historic amount_paid.
- public.refunds: separate refund ledger. Completed refunds affect net cash only.
- public.stock_movements: auditable stock changes.
- public.suppliers and public.stock_purchases: supplier and purchase records.
- apply_receipt_payment(): locks the receipt, rejects overpayment, updates amount_paid/outstanding/payment_status, and records the ledger entry in one transaction.
- record_refund(): records a refund without changing the receipt balance.
- record_stock_movement(): updates stock quantity and writes a movement in one transaction.

Formulas:
- Sales = sum of receipt.total for non-deleted receipts in the selected receipt_date range.
- Cash collected = sum of receipt.amount_paid for those receipts.
- Outstanding = sum of receipt.outstanding.
- Net cash = cash collected minus completed refunds in the selected period.
- Operating expenses = sum of expenses.amount in the selected expense_date range.
- Gross profit is not calculated unless every relevant cost is known and linked. Historic receipt lines are not automatically linked to products.
- Stock purchases are inventory, not operating expenses.

Test first on an isolated Supabase project. Do not apply to production until approved.
