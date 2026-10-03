
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "abandoned_carts": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"items": NonNullable<Json>,"last_seen_at": string,"recover_token": string,"recovered_at": string | null,"reminder_1_at": string | null,"reminder_2_at": string | null,"reminder_3_at": string | null,"total_price": number,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"items"?: NonNullable<Json>,"last_seen_at"?: string,"recover_token"?: string,"recovered_at"?: string | null,"reminder_1_at"?: string | null,"reminder_2_at"?: string | null,"reminder_3_at"?: string | null,"total_price"?: number,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"items"?: NonNullable<Json>,"last_seen_at"?: string,"recover_token"?: string,"recovered_at"?: string | null,"reminder_1_at"?: string | null,"reminder_2_at"?: string | null,"reminder_3_at"?: string | null,"total_price"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"acc_doc_sequences": {
                  Row: {
                    "doc_type": string,"last_number": number,"prefix": string,"year": number
                  }
                  Insert: {
                    "doc_type": string,"last_number"?: number,"prefix": string,"year": number
                  }
                  Update: {
                    "doc_type"?: string,"last_number"?: number,"prefix"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_doc_sequences_doc_type_fkey"
      columns: ["doc_type"]
isOneToOne: true
      referencedRelation: "acc_doc_types"
      referencedColumns: ["code"]
    }
                  ]
                },"acc_doc_types": {
                  Row: {
                    "code": string,"direction": string,"name": string,"sort_order": number | null
                  }
                  Insert: {
                    "code": string,"direction": string,"name": string,"sort_order"?: number | null
                  }
                  Update: {
                    "code"?: string,"direction"?: string,"name"?: string,"sort_order"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"acc_document_lines": {
                  Row: {
                    "adjusted_qty": number | null,"amount": number | null,"cost_price": number | null,"document_id": string,"exchange_rate": number,"fulfillment_type": string,"id": number,"is_bonus": boolean,"manual_reason": string | null,"meta": NonNullable<Json>,"original_qty": number | null,"overreceipt_reason": string | null,"po_line_id": number | null,"price": number,"price_uah": number | null,"qty": number,"qty_actual": number | null,"qty_in_base": number | null,"qty_system": number | null,"sku": string,"sort_order": number | null,"supplier_id": number | null,"uom_code": string | null,"uom_factor": number,"warehouse_id": number | null
                  }
                  Insert: {
                    "adjusted_qty"?: number | null,"amount"?: never,"cost_price"?: number | null,"document_id": string,"exchange_rate"?: number,"fulfillment_type"?: string,"id"?: number,"is_bonus"?: boolean,"manual_reason"?: string | null,"meta"?: NonNullable<Json>,"original_qty"?: number | null,"overreceipt_reason"?: string | null,"po_line_id"?: number | null,"price": number,"price_uah"?: never,"qty": number,"qty_actual"?: number | null,"qty_in_base"?: never,"qty_system"?: number | null,"sku": string,"sort_order"?: number | null,"supplier_id"?: number | null,"uom_code"?: string | null,"uom_factor"?: number,"warehouse_id"?: number | null
                  }
                  Update: {
                    "adjusted_qty"?: number | null,"amount"?: never,"cost_price"?: number | null,"document_id"?: string,"exchange_rate"?: number,"fulfillment_type"?: string,"id"?: number,"is_bonus"?: boolean,"manual_reason"?: string | null,"meta"?: NonNullable<Json>,"original_qty"?: number | null,"overreceipt_reason"?: string | null,"po_line_id"?: number | null,"price"?: number,"price_uah"?: never,"qty"?: number,"qty_actual"?: number | null,"qty_in_base"?: never,"qty_system"?: number | null,"sku"?: string,"sort_order"?: number | null,"supplier_id"?: number | null,"uom_code"?: string | null,"uom_factor"?: number,"warehouse_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_document_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_document_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_document_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "acc_document_lines_po_line_id_fkey"
      columns: ["po_line_id"]
isOneToOne: false
      referencedRelation: "acc_document_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_document_lines_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "acc_document_lines_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "acc_document_lines_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "acc_document_lines_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_document_lines_uom_code_fkey"
      columns: ["uom_code"]
isOneToOne: false
      referencedRelation: "uom"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "acc_document_lines_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"acc_documents": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"channel_code": string | null,"confirmed_at": string | null,"confirmed_by": string | null,"contract_id": string | null,"counterparty": string | null,"created_at": string | null,"created_by": string | null,"currency": string | null,"customer_id": string | null,"doc_date": string,"doc_number": string,"doc_type": string,"email_sent_at": string | null,"exchange_rate": number,"expected_date": string | null,"id": string,"landed_cost_method": string | null,"landed_cost_total": number | null,"marketplace_order_id": string | null,"meta": NonNullable<Json>,"notes": string | null,"order_id": string | null,"parent_doc_id": string | null,"po_status": string | null,"procurement_status": string | null,"reversal_of": string | null,"status": string,"supplier_contract_id": string | null,"supplier_id": number | null,"supplier_invoice_amount": number | null,"supplier_invoice_date": string | null,"supplier_invoice_number": string | null,"total_amount": number,"total_cost": number,"tracking_number": string | null,"warehouse_id": number | null,"warehouse_to_id": number | null
                  }
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"channel_code"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"contract_id"?: string | null,"counterparty"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string | null,"customer_id"?: string | null,"doc_date"?: string,"doc_number": string,"doc_type": string,"email_sent_at"?: string | null,"exchange_rate"?: number,"expected_date"?: string | null,"id"?: string,"landed_cost_method"?: string | null,"landed_cost_total"?: number | null,"marketplace_order_id"?: string | null,"meta"?: NonNullable<Json>,"notes"?: string | null,"order_id"?: string | null,"parent_doc_id"?: string | null,"po_status"?: string | null,"procurement_status"?: string | null,"reversal_of"?: string | null,"status"?: string,"supplier_contract_id"?: string | null,"supplier_id"?: number | null,"supplier_invoice_amount"?: number | null,"supplier_invoice_date"?: string | null,"supplier_invoice_number"?: string | null,"total_amount"?: number,"total_cost"?: number,"tracking_number"?: string | null,"warehouse_id"?: number | null,"warehouse_to_id"?: number | null
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"channel_code"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"contract_id"?: string | null,"counterparty"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string | null,"customer_id"?: string | null,"doc_date"?: string,"doc_number"?: string,"doc_type"?: string,"email_sent_at"?: string | null,"exchange_rate"?: number,"expected_date"?: string | null,"id"?: string,"landed_cost_method"?: string | null,"landed_cost_total"?: number | null,"marketplace_order_id"?: string | null,"meta"?: NonNullable<Json>,"notes"?: string | null,"order_id"?: string | null,"parent_doc_id"?: string | null,"po_status"?: string | null,"procurement_status"?: string | null,"reversal_of"?: string | null,"status"?: string,"supplier_contract_id"?: string | null,"supplier_id"?: number | null,"supplier_invoice_amount"?: number | null,"supplier_invoice_date"?: string | null,"supplier_invoice_number"?: string | null,"total_amount"?: number,"total_cost"?: number,"tracking_number"?: string | null,"warehouse_id"?: number | null,"warehouse_to_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_documents_channel_code_fkey"
      columns: ["channel_code"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "acc_documents_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_aging"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "acc_documents_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_balances"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "acc_documents_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "customer_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "acc_documents_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "partner_balance_reconciliation"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "acc_documents_doc_type_fkey"
      columns: ["doc_type"]
isOneToOne: false
      referencedRelation: "acc_doc_types"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "acc_documents_parent_doc_id_fkey"
      columns: ["parent_doc_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_parent_doc_id_fkey"
      columns: ["parent_doc_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_parent_doc_id_fkey"
      columns: ["parent_doc_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "acc_documents_reversal_of_fkey"
      columns: ["reversal_of"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_reversal_of_fkey"
      columns: ["reversal_of"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_reversal_of_fkey"
      columns: ["reversal_of"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "acc_documents_supplier_contract_id_fkey"
      columns: ["supplier_contract_id"]
isOneToOne: false
      referencedRelation: "supplier_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_documents_warehouse_to_id_fkey"
      columns: ["warehouse_to_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fk_acc_doc_mp_order"
      columns: ["marketplace_order_id"]
isOneToOne: false
      referencedRelation: "marketplace_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"acc_expense_categories": {
                  Row: {
                    "code": string,"name": string,"sort_order": number | null
                  }
                  Insert: {
                    "code": string,"name": string,"sort_order"?: number | null
                  }
                  Update: {
                    "code"?: string,"name"?: string,"sort_order"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"acc_expenses": {
                  Row: {
                    "amount": number,"category": string,"created_at": string | null,"created_by": string | null,"description": string | null,"expense_date": string,"id": string,"meta": NonNullable<Json>,"payment_id": string | null,"sub_category": string | null
                  }
                  Insert: {
                    "amount": number,"category": string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"expense_date"?: string,"id"?: string,"meta"?: NonNullable<Json>,"payment_id"?: string | null,"sub_category"?: string | null
                  }
                  Update: {
                    "amount"?: number,"category"?: string,"created_at"?: string | null,"created_by"?: string | null,"description"?: string | null,"expense_date"?: string,"id"?: string,"meta"?: NonNullable<Json>,"payment_id"?: string | null,"sub_category"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_expenses_category_fkey"
      columns: ["category"]
isOneToOne: false
      referencedRelation: "acc_expense_categories"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "acc_expenses_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "acc_payments"
      referencedColumns: ["id"]
    }
                  ]
                },"acc_payment_methods": {
                  Row: {
                    "code": string,"name": string,"sort_order": number | null
                  }
                  Insert: {
                    "code": string,"name": string,"sort_order"?: number | null
                  }
                  Update: {
                    "code"?: string,"name"?: string,"sort_order"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"acc_payments": {
                  Row: {
                    "amount": number,"amount_uah": number | null,"counterparty": string | null,"created_at": string | null,"created_by": string | null,"currency": string,"description": string | null,"document_id": string | null,"exchange_rate": number,"id": string,"meta": NonNullable<Json>,"order_id": string | null,"payment_date": string,"payment_method": string,"payment_type": string,"status": string,"supplier_id": number | null
                  }
                  Insert: {
                    "amount": number,"amount_uah"?: never,"counterparty"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"document_id"?: string | null,"exchange_rate"?: number,"id"?: string,"meta"?: NonNullable<Json>,"order_id"?: string | null,"payment_date"?: string,"payment_method": string,"payment_type": string,"status"?: string,"supplier_id"?: number | null
                  }
                  Update: {
                    "amount"?: number,"amount_uah"?: never,"counterparty"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"document_id"?: string | null,"exchange_rate"?: number,"id"?: string,"meta"?: NonNullable<Json>,"order_id"?: string | null,"payment_date"?: string,"payment_method"?: string,"payment_type"?: string,"status"?: string,"supplier_id"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_payments_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_payments_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acc_payments_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "acc_payments_payment_method_fkey"
      columns: ["payment_method"]
isOneToOne: false
      referencedRelation: "acc_payment_methods"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "acc_payments_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"acc_periods": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"period": string
                  }
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"period": string
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"period"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ads_conversions": {
                  Row: {
                    "conversion_action": string,"conversion_time": string,"currency": string,"error": string | null,"gclid": string,"order_id": string,"order_number": number | null,"retracted_at": string | null,"updated_at": string,"uploaded_at": string | null,"value": number
                  }
                  Insert: {
                    "conversion_action": string,"conversion_time": string,"currency"?: string,"error"?: string | null,"gclid": string,"order_id": string,"order_number"?: number | null,"retracted_at"?: string | null,"updated_at"?: string,"uploaded_at"?: string | null,"value"?: number
                  }
                  Update: {
                    "conversion_action"?: string,"conversion_time"?: string,"currency"?: string,"error"?: string | null,"gclid"?: string,"order_id"?: string,"order_number"?: number | null,"retracted_at"?: string | null,"updated_at"?: string,"uploaded_at"?: string | null,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ads_conversions_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"ads_spend": {
                  Row: {
                    "campaign_id": number,"campaign_name": string,"channel_type": string | null,"clicks": number,"conv_value": number,"conversions": number,"cost_micros": number,"currency": string,"date": string,"impressions": number,"synced_at": string
                  }
                  Insert: {
                    "campaign_id": number,"campaign_name": string,"channel_type"?: string | null,"clicks"?: number,"conv_value"?: number,"conversions"?: number,"cost_micros"?: number,"currency"?: string,"date": string,"impressions"?: number,"synced_at"?: string
                  }
                  Update: {
                    "campaign_id"?: number,"campaign_name"?: string,"channel_type"?: string | null,"clicks"?: number,"conv_value"?: number,"conversions"?: number,"cost_micros"?: number,"currency"?: string,"date"?: string,"impressions"?: number,"synced_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_agent_runs": {
                  Row: {
                    "agent": string,"cost_usd": number,"created_at": string,"created_by": string | null,"duration_ms": number | null,"error": string | null,"id": string,"input": NonNullable<Json>,"input_tokens": number,"model": string,"outcome": string | null,"outcome_at": string | null,"outcome_ref": string | null,"output": Json | null,"output_tokens": number,"tool_calls": number
                  }
                  Insert: {
                    "agent": string,"cost_usd"?: number,"created_at"?: string,"created_by"?: string | null,"duration_ms"?: number | null,"error"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"input_tokens"?: number,"model": string,"outcome"?: string | null,"outcome_at"?: string | null,"outcome_ref"?: string | null,"output"?: Json | null,"output_tokens"?: number,"tool_calls"?: number
                  }
                  Update: {
                    "agent"?: string,"cost_usd"?: number,"created_at"?: string,"created_by"?: string | null,"duration_ms"?: number | null,"error"?: string | null,"id"?: string,"input"?: NonNullable<Json>,"input_tokens"?: number,"model"?: string,"outcome"?: string | null,"outcome_at"?: string | null,"outcome_ref"?: string | null,"output"?: Json | null,"output_tokens"?: number,"tool_calls"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ai_bot_hits": {
                  Row: {
                    "bot": string,"day": string,"hits": number,"section": string
                  }
                  Insert: {
                    "bot": string,"day": string,"hits"?: number,"section": string
                  }
                  Update: {
                    "bot"?: string,"day"?: string,"hits"?: number,"section"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_referrals": {
                  Row: {
                    "day": string,"hits": number,"landing_path": string,"source": string
                  }
                  Insert: {
                    "day": string,"hits"?: number,"landing_path": string,"source": string
                  }
                  Update: {
                    "day"?: string,"hits"?: number,"landing_path"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"alert_throttle": {
                  Row: {
                    "last_sent_at": string,"title": string
                  }
                  Insert: {
                    "last_sent_at": string,"title": string
                  }
                  Update: {
                    "last_sent_at"?: string,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_settings": {
                  Row: {
                    "key": string,"value": string
                  }
                  Insert: {
                    "key": string,"value": string
                  }
                  Update: {
                    "key"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ar_corrections": {
                  Row: {
                    "amount": number,"business_date": string,"cancelled_at": string | null,"cancelled_by": string | null,"confirmed_at": string | null,"confirmed_by": string | null,"correction_type": string,"created_at": string | null,"created_by": string | null,"currency": string,"doc_number": string,"from_contract_id": string | null,"from_customer_id": string | null,"id": string,"notes": string | null,"reason": string,"status": string,"to_contract_id": string | null,"to_customer_id": string | null,"txn_id": string | null
                  }
                  Insert: {
                    "amount": number,"business_date"?: string,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"correction_type": string,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"doc_number": string,"from_contract_id"?: string | null,"from_customer_id"?: string | null,"id"?: string,"notes"?: string | null,"reason": string,"status"?: string,"to_contract_id"?: string | null,"to_customer_id"?: string | null,"txn_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"business_date"?: string,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"correction_type"?: string,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"doc_number"?: string,"from_contract_id"?: string | null,"from_customer_id"?: string | null,"id"?: string,"notes"?: string | null,"reason"?: string,"status"?: string,"to_contract_id"?: string | null,"to_customer_id"?: string | null,"txn_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ar_corrections_from_contract_id_fkey"
      columns: ["from_contract_id"]
isOneToOne: false
      referencedRelation: "ar_aging"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "ar_corrections_from_contract_id_fkey"
      columns: ["from_contract_id"]
isOneToOne: false
      referencedRelation: "ar_balances"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "ar_corrections_from_contract_id_fkey"
      columns: ["from_contract_id"]
isOneToOne: false
      referencedRelation: "customer_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ar_corrections_to_contract_id_fkey"
      columns: ["to_contract_id"]
isOneToOne: false
      referencedRelation: "ar_aging"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "ar_corrections_to_contract_id_fkey"
      columns: ["to_contract_id"]
isOneToOne: false
      referencedRelation: "ar_balances"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "ar_corrections_to_contract_id_fkey"
      columns: ["to_contract_id"]
isOneToOne: false
      referencedRelation: "customer_contracts"
      referencedColumns: ["id"]
    }
                  ]
                },"blog_posts": {
                  Row: {
                    "category": string,"category_ru": string | null,"content_html": string,"content_html_ru": string | null,"created_at": string,"description": string,"description_ru": string | null,"faq": NonNullable<Json>,"faq_ru": NonNullable<Json>,"id": number,"image": string | null,"image_ru": string | null,"is_published": boolean,"keywords": (string)[],"product_skus": (string)[],"published_at": string | null,"read_time": number,"related_links": NonNullable<Json>,"slug": string,"title": string,"title_ru": string | null,"updated_at": string
                  }
                  Insert: {
                    "category"?: string,"category_ru"?: string | null,"content_html": string,"content_html_ru"?: string | null,"created_at"?: string,"description": string,"description_ru"?: string | null,"faq"?: NonNullable<Json>,"faq_ru"?: NonNullable<Json>,"id"?: number,"image"?: string | null,"image_ru"?: string | null,"is_published"?: boolean,"keywords"?: (string)[],"product_skus"?: (string)[],"published_at"?: string | null,"read_time"?: number,"related_links"?: NonNullable<Json>,"slug": string,"title": string,"title_ru"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"category_ru"?: string | null,"content_html"?: string,"content_html_ru"?: string | null,"created_at"?: string,"description"?: string,"description_ru"?: string | null,"faq"?: NonNullable<Json>,"faq_ru"?: NonNullable<Json>,"id"?: number,"image"?: string | null,"image_ru"?: string | null,"is_published"?: boolean,"keywords"?: (string)[],"product_skus"?: (string)[],"published_at"?: string | null,"read_time"?: number,"related_links"?: NonNullable<Json>,"slug"?: string,"title"?: string,"title_ru"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"brand_logos": {
                  Row: {
                    "brand_name": string,"logo_url": string,"show_on_home": boolean,"updated_at": string
                  }
                  Insert: {
                    "brand_name": string,"logo_url": string,"show_on_home"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "brand_name"?: string,"logo_url"?: string,"show_on_home"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "created_at": string | null,"description": string | null,"epicentr_category_code": string | null,"epicentr_commission_pct": number | null,"epicentr_markup_pct": number | null,"id": number,"name": string,"parent_slug": string | null,"prom_commission_pct": number | null,"prom_commission_pct_econom": number | null,"prom_commission_pct_more_sales": number | null,"prom_commission_pct_turbo": number | null,"prom_markup_pct": number | null,"prom_section_id": number | null,"prom_section_name": string | null,"prom_section_url": string | null,"rozetka_category_id": string | null,"rozetka_category_name": string | null,"rozetka_commission_label": string | null,"rozetka_commission_pct": number | null,"rozetka_commission_rz_id": string | null,"rozetka_markup_pct": number | null,"slug": string,"sort_order": number | null
                  }
                  Insert: {
                    "created_at"?: string | null,"description"?: string | null,"epicentr_category_code"?: string | null,"epicentr_commission_pct"?: number | null,"epicentr_markup_pct"?: number | null,"id"?: number,"name": string,"parent_slug"?: string | null,"prom_commission_pct"?: number | null,"prom_commission_pct_econom"?: number | null,"prom_commission_pct_more_sales"?: number | null,"prom_commission_pct_turbo"?: number | null,"prom_markup_pct"?: number | null,"prom_section_id"?: number | null,"prom_section_name"?: string | null,"prom_section_url"?: string | null,"rozetka_category_id"?: string | null,"rozetka_category_name"?: string | null,"rozetka_commission_label"?: string | null,"rozetka_commission_pct"?: number | null,"rozetka_commission_rz_id"?: string | null,"rozetka_markup_pct"?: number | null,"slug": string,"sort_order"?: number | null
                  }
                  Update: {
                    "created_at"?: string | null,"description"?: string | null,"epicentr_category_code"?: string | null,"epicentr_commission_pct"?: number | null,"epicentr_markup_pct"?: number | null,"id"?: number,"name"?: string,"parent_slug"?: string | null,"prom_commission_pct"?: number | null,"prom_commission_pct_econom"?: number | null,"prom_commission_pct_more_sales"?: number | null,"prom_commission_pct_turbo"?: number | null,"prom_markup_pct"?: number | null,"prom_section_id"?: number | null,"prom_section_name"?: string | null,"prom_section_url"?: string | null,"rozetka_category_id"?: string | null,"rozetka_category_name"?: string | null,"rozetka_commission_label"?: string | null,"rozetka_commission_pct"?: number | null,"rozetka_commission_rz_id"?: string | null,"rozetka_markup_pct"?: number | null,"slug"?: string,"sort_order"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_slug_fkey"
      columns: ["parent_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    }
                  ]
                },"category_characteristics": {
                  Row: {
                    "category_slug": string,"default_value": string | null,"definition_id": number,"filter_order": number | null,"is_filter": boolean | null,"required": boolean,"sort_order": number | null
                  }
                  Insert: {
                    "category_slug": string,"default_value"?: string | null,"definition_id": number,"filter_order"?: number | null,"is_filter"?: boolean | null,"required"?: boolean,"sort_order"?: number | null
                  }
                  Update: {
                    "category_slug"?: string,"default_value"?: string | null,"definition_id"?: number,"filter_order"?: number | null,"is_filter"?: boolean | null,"required"?: boolean,"sort_order"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_characteristics_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "characteristic_definitions"
      referencedColumns: ["id"]
    }
                  ]
                },"category_content": {
                  Row: {
                    "blog_slug": string | null,"description": string,"faq": NonNullable<Json>,"guide": Json | null,"lang": string,"related": NonNullable<Json>,"seo_text": string | null,"slug": string,"source": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "blog_slug"?: string | null,"description"?: string,"faq"?: NonNullable<Json>,"guide"?: Json | null,"lang": string,"related"?: NonNullable<Json>,"seo_text"?: string | null,"slug": string,"source"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "blog_slug"?: string | null,"description"?: string,"faq"?: NonNullable<Json>,"guide"?: Json | null,"lang"?: string,"related"?: NonNullable<Json>,"seo_text"?: string | null,"slug"?: string,"source"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"characteristic_definitions": {
                  Row: {
                    "aliases": (string)[],"id": number,"is_filter": boolean,"is_multiselect": boolean,"kind": string,"label": string,"sort_order": number,"unit": string | null
                  }
                  Insert: {
                    "aliases"?: (string)[],"id"?: number,"is_filter"?: boolean,"is_multiselect"?: boolean,"kind"?: string,"label": string,"sort_order"?: number,"unit"?: string | null
                  }
                  Update: {
                    "aliases"?: (string)[],"id"?: number,"is_filter"?: boolean,"is_multiselect"?: boolean,"kind"?: string,"label"?: string,"sort_order"?: number,"unit"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"characteristic_values": {
                  Row: {
                    "aliases": (string)[],"category_slugs": (string)[],"definition_id": number,"id": number,"match_patterns": (string)[],"sort_order": number,"value": string
                  }
                  Insert: {
                    "aliases"?: (string)[],"category_slugs"?: (string)[],"definition_id": number,"id"?: number,"match_patterns"?: (string)[],"sort_order"?: number,"value": string
                  }
                  Update: {
                    "aliases"?: (string)[],"category_slugs"?: (string)[],"definition_id"?: number,"id"?: number,"match_patterns"?: (string)[],"sort_order"?: number,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "characteristic_values_definition_id_fkey"
      columns: ["definition_id"]
isOneToOne: false
      referencedRelation: "characteristic_definitions"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "content": string,"created_at": string | null,"id": string,"role": string,"session_id": string
                  }
                  Insert: {
                    "content": string,"created_at"?: string | null,"id"?: string,"role": string,"session_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string | null,"id"?: string,"role"?: string,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "chat_sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"chat_sessions": {
                  Row: {
                    "ai_enabled": boolean,"created_at": string | null,"id": string,"last_message_at": string | null,"status": string,"unread_count": number,"visitor_id": string
                  }
                  Insert: {
                    "ai_enabled"?: boolean,"created_at"?: string | null,"id"?: string,"last_message_at"?: string | null,"status"?: string,"unread_count"?: number,"visitor_id": string
                  }
                  Update: {
                    "ai_enabled"?: boolean,"created_at"?: string | null,"id"?: string,"last_message_at"?: string | null,"status"?: string,"unread_count"?: number,"visitor_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"counterparty_balances": {
                  Row: {
                    "account_type": string,"balance": number,"counterparty_id": string,"currency": string,"updated_at": string | null
                  }
                  Insert: {
                    "account_type": string,"balance"?: number,"counterparty_id": string,"currency"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "account_type"?: string,"balance"?: number,"counterparty_id"?: string,"currency"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"currencies": {
                  Row: {
                    "code": string,"is_active": boolean,"is_base": boolean,"name": string,"symbol": string
                  }
                  Insert: {
                    "code": string,"is_active"?: boolean,"is_base"?: boolean,"name": string,"symbol": string
                  }
                  Update: {
                    "code"?: string,"is_active"?: boolean,"is_base"?: boolean,"name"?: string,"symbol"?: string
                  }
                  Relationships: [
                    
                  ]
                },"customer_contracts": {
                  Row: {
                    "allow_promo": boolean,"contract_number": string,"created_at": string | null,"created_by": string | null,"credit_days": number,"credit_limit": number,"currency": string,"customer_id": string,"customer_name": string | null,"discount_pct": number,"end_date": string | null,"id": string,"is_auto": boolean | null,"notes": string | null,"payment_terms": string | null,"price_type": string | null,"start_date": string,"status": string,"updated_at": string | null
                  }
                  Insert: {
                    "allow_promo"?: boolean,"contract_number": string,"created_at"?: string | null,"created_by"?: string | null,"credit_days"?: number,"credit_limit"?: number,"currency"?: string,"customer_id": string,"customer_name"?: string | null,"discount_pct"?: number,"end_date"?: string | null,"id"?: string,"is_auto"?: boolean | null,"notes"?: string | null,"payment_terms"?: string | null,"price_type"?: string | null,"start_date": string,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "allow_promo"?: boolean,"contract_number"?: string,"created_at"?: string | null,"created_by"?: string | null,"credit_days"?: number,"credit_limit"?: number,"currency"?: string,"customer_id"?: string,"customer_name"?: string | null,"discount_pct"?: number,"end_date"?: string | null,"id"?: string,"is_auto"?: boolean | null,"notes"?: string | null,"payment_terms"?: string | null,"price_type"?: string | null,"start_date"?: string,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"customer_notifications": {
                  Row: {
                    "body": string,"channel": string | null,"created_at": string,"error": string | null,"event": string,"id": string,"order_id": string,"phone": string,"provider": string | null,"provider_message_id": string | null,"sent_at": string | null,"status": string
                  }
                  Insert: {
                    "body": string,"channel"?: string | null,"created_at"?: string,"error"?: string | null,"event": string,"id"?: string,"order_id": string,"phone": string,"provider"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string
                  }
                  Update: {
                    "body"?: string,"channel"?: string | null,"created_at"?: string,"error"?: string | null,"event"?: string,"id"?: string,"order_id"?: string,"phone"?: string,"provider"?: string | null,"provider_message_id"?: string | null,"sent_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_notifications_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_price_rules": {
                  Row: {
                    "category_slug": string | null,"created_at": string | null,"customer_id": string,"discount_pct": number | null,"id": number,"is_active": boolean,"notes": string | null,"price_list_id": number | null,"price_override": number | null,"sku": string | null,"valid_from": string | null,"valid_until": string | null
                  }
                  Insert: {
                    "category_slug"?: string | null,"created_at"?: string | null,"customer_id": string,"discount_pct"?: number | null,"id"?: number,"is_active"?: boolean,"notes"?: string | null,"price_list_id"?: number | null,"price_override"?: number | null,"sku"?: string | null,"valid_from"?: string | null,"valid_until"?: string | null
                  }
                  Update: {
                    "category_slug"?: string | null,"created_at"?: string | null,"customer_id"?: string,"discount_pct"?: number | null,"id"?: number,"is_active"?: boolean,"notes"?: string | null,"price_list_id"?: number | null,"price_override"?: number | null,"sku"?: string | null,"valid_from"?: string | null,"valid_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_price_rules_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "customer_price_rules_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_price_rules_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "partner_balance_reconciliation"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "customer_price_rules_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_price_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "customer_price_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "customer_price_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"customers": {
                  Row: {
                    "address": string | null,"auth_user_id": string | null,"balance": number,"balance_held": number,"bank_iban": string | null,"bank_mfo": string | null,"bank_name": string | null,"city": string | null,"commission_pct": number | null,"company": string | null,"created_at": string | null,"credit_limit": number | null,"customer_number": number,"discount_pct": number | null,"email": string | null,"id": string,"is_active": boolean,"last_order_at": string | null,"legal_address": string | null,"legal_name": string | null,"meta": NonNullable<Json>,"name": string,"notes": string | null,"orders_count": number,"partner_code": string | null,"payment_terms_days": number | null,"phone": string | null,"price_list_id": number | null,"price_tier": string,"tax_number": string | null,"total_revenue": number,"type": string,"updated_at": string | null
                  }
                  Insert: {
                    "address"?: string | null,"auth_user_id"?: string | null,"balance"?: number,"balance_held"?: number,"bank_iban"?: string | null,"bank_mfo"?: string | null,"bank_name"?: string | null,"city"?: string | null,"commission_pct"?: number | null,"company"?: string | null,"created_at"?: string | null,"credit_limit"?: number | null,"customer_number"?: number,"discount_pct"?: number | null,"email"?: string | null,"id"?: string,"is_active"?: boolean,"last_order_at"?: string | null,"legal_address"?: string | null,"legal_name"?: string | null,"meta"?: NonNullable<Json>,"name": string,"notes"?: string | null,"orders_count"?: number,"partner_code"?: string | null,"payment_terms_days"?: number | null,"phone"?: string | null,"price_list_id"?: number | null,"price_tier"?: string,"tax_number"?: string | null,"total_revenue"?: number,"type"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"auth_user_id"?: string | null,"balance"?: number,"balance_held"?: number,"bank_iban"?: string | null,"bank_mfo"?: string | null,"bank_name"?: string | null,"city"?: string | null,"commission_pct"?: number | null,"company"?: string | null,"created_at"?: string | null,"credit_limit"?: number | null,"customer_number"?: number,"discount_pct"?: number | null,"email"?: string | null,"id"?: string,"is_active"?: boolean,"last_order_at"?: string | null,"legal_address"?: string | null,"legal_name"?: string | null,"meta"?: NonNullable<Json>,"name"?: string,"notes"?: string | null,"orders_count"?: number,"partner_code"?: string | null,"payment_terms_days"?: number | null,"phone"?: string | null,"price_list_id"?: number | null,"price_tier"?: string,"tax_number"?: string | null,"total_revenue"?: number,"type"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_adjustment_lines": {
                  Row: {
                    "amount": number,"created_at": string,"credit_account": string,"credit_order_id": string | null,"credit_party": string | null,"debit_account": string,"debit_order_id": string | null,"debit_party": string | null,"document_id": string,"id": number,"line_no": number,"note": string | null,"op": string,"reversal_txn_id": string | null,"txn_id": string | null
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"credit_account": string,"credit_order_id"?: string | null,"credit_party"?: string | null,"debit_account": string,"debit_order_id"?: string | null,"debit_party"?: string | null,"document_id": string,"id"?: number,"line_no": number,"note"?: string | null,"op": string,"reversal_txn_id"?: string | null,"txn_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"credit_account"?: string,"credit_order_id"?: string | null,"credit_party"?: string | null,"debit_account"?: string,"debit_order_id"?: string | null,"debit_party"?: string | null,"document_id"?: string,"id"?: number,"line_no"?: number,"note"?: string | null,"op"?: string,"reversal_txn_id"?: string | null,"txn_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_adjustment_lines_credit_order_id_fkey"
      columns: ["credit_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_adjustment_lines_debit_order_id_fkey"
      columns: ["debit_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_adjustment_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_adjustment_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_adjustment_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    }
                  ]
                },"exchange_rates": {
                  Row: {
                    "currency": string,"id": number,"rate": number,"rate_date": string,"source": string
                  }
                  Insert: {
                    "currency": string,"id"?: number,"rate": number,"rate_date": string,"source"?: string
                  }
                  Update: {
                    "currency"?: string,"id"?: number,"rate"?: number,"rate_date"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "exchange_rates_currency_fkey"
      columns: ["currency"]
isOneToOne: false
      referencedRelation: "currencies"
      referencedColumns: ["code"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"business_date": string,"counterparty": string | null,"created_at": string | null,"created_by": string | null,"currency": string,"description": string,"doc_ref": string | null,"expense_type": string,"id": string,"payment_method": string,"source": string | null,"source_id": string | null,"txn_id": string | null
                  }
                  Insert: {
                    "amount": number,"business_date"?: string,"counterparty"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"description": string,"doc_ref"?: string | null,"expense_type": string,"id"?: string,"payment_method"?: string,"source"?: string | null,"source_id"?: string | null,"txn_id"?: string | null
                  }
                  Update: {
                    "amount"?: number,"business_date"?: string,"counterparty"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"description"?: string,"doc_ref"?: string | null,"expense_type"?: string,"id"?: string,"payment_method"?: string,"source"?: string | null,"source_id"?: string | null,"txn_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"fulfillment_rules": {
                  Row: {
                    "category_slug": string | null,"channel_code": string | null,"created_at": string | null,"customer_type": string | null,"id": number,"is_active": boolean,"name": string,"notes": string | null,"priority": number,"region": string | null,"sku": string | null,"warehouse_id": number
                  }
                  Insert: {
                    "category_slug"?: string | null,"channel_code"?: string | null,"created_at"?: string | null,"customer_type"?: string | null,"id"?: number,"is_active"?: boolean,"name": string,"notes"?: string | null,"priority"?: number,"region"?: string | null,"sku"?: string | null,"warehouse_id": number
                  }
                  Update: {
                    "category_slug"?: string | null,"channel_code"?: string | null,"created_at"?: string | null,"customer_type"?: string | null,"id"?: number,"is_active"?: boolean,"name"?: string,"notes"?: string | null,"priority"?: number,"region"?: string | null,"sku"?: string | null,"warehouse_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fulfillment_rules_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "fulfillment_rules_channel_code_fkey"
      columns: ["channel_code"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "fulfillment_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "fulfillment_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "fulfillment_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "fulfillment_rules_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"gsc_daily": {
                  Row: {
                    "clicks": number,"date": string,"impressions": number,"page_path": string,"position": number
                  }
                  Insert: {
                    "clicks"?: number,"date": string,"impressions"?: number,"page_path": string,"position"?: number
                  }
                  Update: {
                    "clicks"?: number,"date"?: string,"impressions"?: number,"page_path"?: string,"position"?: number
                  }
                  Relationships: [
                    
                  ]
                },"landed_cost_lines": {
                  Row: {
                    "amount": number,"cost_type": string,"created_at": string | null,"description": string | null,"distributed": boolean,"document_id": string,"id": string
                  }
                  Insert: {
                    "amount": number,"cost_type": string,"created_at"?: string | null,"description"?: string | null,"distributed"?: boolean,"document_id": string,"id"?: string
                  }
                  Update: {
                    "amount"?: number,"cost_type"?: string,"created_at"?: string | null,"description"?: string | null,"distributed"?: boolean,"document_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "landed_cost_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "landed_cost_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "landed_cost_lines_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    }
                  ]
                },"mail_oauth_tokens": {
                  Row: {
                    "access_token": string,"account_id": string | null,"expires_at": string,"id": number,"refresh_token": string,"updated_at": string | null
                  }
                  Insert: {
                    "access_token": string,"account_id"?: string | null,"expires_at": string,"id"?: number,"refresh_token": string,"updated_at"?: string | null
                  }
                  Update: {
                    "access_token"?: string,"account_id"?: string | null,"expires_at"?: string,"id"?: number,"refresh_token"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"mail_read_messages": {
                  Row: {
                    "message_id": string,"read_at": string | null
                  }
                  Insert: {
                    "message_id": string,"read_at"?: string | null
                  }
                  Update: {
                    "message_id"?: string,"read_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"mail_register_imports": {
                  Row: {
                    "error": string | null,"kind": string,"message_id": string,"processed_at": string,"received_at": string | null,"register_no": string | null,"result": Json | null,"source": string,"status": string,"subject": string | null
                  }
                  Insert: {
                    "error"?: string | null,"kind": string,"message_id": string,"processed_at"?: string,"received_at"?: string | null,"register_no"?: string | null,"result"?: Json | null,"source": string,"status": string,"subject"?: string | null
                  }
                  Update: {
                    "error"?: string | null,"kind"?: string,"message_id"?: string,"processed_at"?: string,"received_at"?: string | null,"register_no"?: string | null,"result"?: Json | null,"source"?: string,"status"?: string,"subject"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"market_price_checks": {
                  Row: {
                    "checked_at": string | null,"delta_pct": number | null,"id": string,"market_avg": number | null,"market_min": number | null,"match_count": number | null,"our_price": number | null,"product_name": string,"prom_min": number | null,"results": Json | null,"rozetka_min": number | null,"sku": string,"status": string | null
                  }
                  Insert: {
                    "checked_at"?: string | null,"delta_pct"?: number | null,"id"?: string,"market_avg"?: number | null,"market_min"?: number | null,"match_count"?: number | null,"our_price"?: number | null,"product_name": string,"prom_min"?: number | null,"results"?: Json | null,"rozetka_min"?: number | null,"sku": string,"status"?: string | null
                  }
                  Update: {
                    "checked_at"?: string | null,"delta_pct"?: number | null,"id"?: string,"market_avg"?: number | null,"market_min"?: number | null,"match_count"?: number | null,"our_price"?: number | null,"product_name"?: string,"prom_min"?: number | null,"results"?: Json | null,"rozetka_min"?: number | null,"sku"?: string,"status"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "market_price_checks_sku_fkey"
      columns: ["sku"]
isOneToOne: true
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "market_price_checks_sku_fkey"
      columns: ["sku"]
isOneToOne: true
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "market_price_checks_sku_fkey"
      columns: ["sku"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"marketplace_accounts": {
                  Row: {
                    "api_credentials": NonNullable<Json>,"channel_code": string,"commission_pct": number | null,"created_at": string | null,"feed_format": string | null,"feed_token": string | null,"feed_url": string | null,"id": number,"is_active": boolean,"last_orders_sync_at": string | null,"last_price_sync_at": string | null,"last_products_sync_at": string | null,"last_stock_sync_at": string | null,"name": string,"platform": string,"price_list_id": number | null,"settings": NonNullable<Json>,"shop_id": string | null
                  }
                  Insert: {
                    "api_credentials"?: NonNullable<Json>,"channel_code": string,"commission_pct"?: number | null,"created_at"?: string | null,"feed_format"?: string | null,"feed_token"?: string | null,"feed_url"?: string | null,"id"?: number,"is_active"?: boolean,"last_orders_sync_at"?: string | null,"last_price_sync_at"?: string | null,"last_products_sync_at"?: string | null,"last_stock_sync_at"?: string | null,"name": string,"platform": string,"price_list_id"?: number | null,"settings"?: NonNullable<Json>,"shop_id"?: string | null
                  }
                  Update: {
                    "api_credentials"?: NonNullable<Json>,"channel_code"?: string,"commission_pct"?: number | null,"created_at"?: string | null,"feed_format"?: string | null,"feed_token"?: string | null,"feed_url"?: string | null,"id"?: number,"is_active"?: boolean,"last_orders_sync_at"?: string | null,"last_price_sync_at"?: string | null,"last_products_sync_at"?: string | null,"last_stock_sync_at"?: string | null,"name"?: string,"platform"?: string,"price_list_id"?: number | null,"settings"?: NonNullable<Json>,"shop_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_accounts_channel_code_fkey"
      columns: ["channel_code"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "marketplace_accounts_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_chat_drafts": {
                  Row: {
                    "category": string,"chat_id": string,"cost_usd": number,"created_at": string,"draft": string,"id": string,"input_tokens": number,"last_incoming_at": string,"model": string,"mp": string,"needs_human": boolean,"outcome": string | null,"outcome_at": string | null,"output_tokens": number,"reason": string | null,"sent_text": string | null,"summary": string,"tool_calls": number
                  }
                  Insert: {
                    "category": string,"chat_id": string,"cost_usd"?: number,"created_at"?: string,"draft": string,"id"?: string,"input_tokens"?: number,"last_incoming_at": string,"model": string,"mp": string,"needs_human"?: boolean,"outcome"?: string | null,"outcome_at"?: string | null,"output_tokens"?: number,"reason"?: string | null,"sent_text"?: string | null,"summary": string,"tool_calls"?: number
                  }
                  Update: {
                    "category"?: string,"chat_id"?: string,"cost_usd"?: number,"created_at"?: string,"draft"?: string,"id"?: string,"input_tokens"?: number,"last_incoming_at"?: string,"model"?: string,"mp"?: string,"needs_human"?: boolean,"outcome"?: string | null,"outcome_at"?: string | null,"output_tokens"?: number,"reason"?: string | null,"sent_text"?: string | null,"summary"?: string,"tool_calls"?: number
                  }
                  Relationships: [
                    
                  ]
                },"marketplace_chat_seen": {
                  Row: {
                    "chat_id": string,"mp": string,"seen_at": string,"seen_update": string | null
                  }
                  Insert: {
                    "chat_id": string,"mp": string,"seen_at"?: string,"seen_update"?: string | null
                  }
                  Update: {
                    "chat_id"?: string,"mp"?: string,"seen_at"?: string,"seen_update"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"marketplace_listings": {
                  Row: {
                    "created_at": string | null,"external_category_id": string | null,"external_product_id": string | null,"external_sku": string | null,"external_url": string | null,"id": number,"is_listed": boolean,"last_sync_error": string | null,"last_synced_at": string | null,"last_synced_price": number | null,"last_synced_qty": number | null,"listing_status": string,"listing_status_reason": string | null,"marketplace_id": number,"meta": NonNullable<Json>,"needs_sync": boolean,"price_formula": Json | null,"price_override": number | null,"price_strategy": string,"qty_buffer": number,"qty_limit": number | null,"sku": string
                  }
                  Insert: {
                    "created_at"?: string | null,"external_category_id"?: string | null,"external_product_id"?: string | null,"external_sku"?: string | null,"external_url"?: string | null,"id"?: number,"is_listed"?: boolean,"last_sync_error"?: string | null,"last_synced_at"?: string | null,"last_synced_price"?: number | null,"last_synced_qty"?: number | null,"listing_status"?: string,"listing_status_reason"?: string | null,"marketplace_id": number,"meta"?: NonNullable<Json>,"needs_sync"?: boolean,"price_formula"?: Json | null,"price_override"?: number | null,"price_strategy"?: string,"qty_buffer"?: number,"qty_limit"?: number | null,"sku": string
                  }
                  Update: {
                    "created_at"?: string | null,"external_category_id"?: string | null,"external_product_id"?: string | null,"external_sku"?: string | null,"external_url"?: string | null,"id"?: number,"is_listed"?: boolean,"last_sync_error"?: string | null,"last_synced_at"?: string | null,"last_synced_price"?: number | null,"last_synced_qty"?: number | null,"listing_status"?: string,"listing_status_reason"?: string | null,"marketplace_id"?: number,"meta"?: NonNullable<Json>,"needs_sync"?: boolean,"price_formula"?: Json | null,"price_override"?: number | null,"price_strategy"?: string,"qty_buffer"?: number,"qty_limit"?: number | null,"sku"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_listings_marketplace_id_fkey"
      columns: ["marketplace_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_listings_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "marketplace_listings_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "marketplace_listings_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"marketplace_orders": {
                  Row: {
                    "buyer_email": string | null,"buyer_name": string | null,"buyer_phone": string | null,"commission_amount": number | null,"commission_pct": number | null,"delivery_address": string | null,"delivery_city": string | null,"external_order_id": string,"external_order_num": string | null,"id": string,"imported_at": string,"marketplace_id": number,"our_order_id": string | null,"processed_at": string | null,"processing_error": string | null,"raw_payload": NonNullable<Json>,"status_external": string,"status_mapped": string | null,"total_amount": number | null,"tracking_number": string | null
                  }
                  Insert: {
                    "buyer_email"?: string | null,"buyer_name"?: string | null,"buyer_phone"?: string | null,"commission_amount"?: never,"commission_pct"?: number | null,"delivery_address"?: string | null,"delivery_city"?: string | null,"external_order_id": string,"external_order_num"?: string | null,"id"?: string,"imported_at"?: string,"marketplace_id": number,"our_order_id"?: string | null,"processed_at"?: string | null,"processing_error"?: string | null,"raw_payload"?: NonNullable<Json>,"status_external": string,"status_mapped"?: string | null,"total_amount"?: number | null,"tracking_number"?: string | null
                  }
                  Update: {
                    "buyer_email"?: string | null,"buyer_name"?: string | null,"buyer_phone"?: string | null,"commission_amount"?: never,"commission_pct"?: number | null,"delivery_address"?: string | null,"delivery_city"?: string | null,"external_order_id"?: string,"external_order_num"?: string | null,"id"?: string,"imported_at"?: string,"marketplace_id"?: number,"our_order_id"?: string | null,"processed_at"?: string | null,"processing_error"?: string | null,"raw_payload"?: NonNullable<Json>,"status_external"?: string,"status_mapped"?: string | null,"total_amount"?: number | null,"tracking_number"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_orders_marketplace_id_fkey"
      columns: ["marketplace_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_refunds": {
                  Row: {
                    "first_seen_at": string,"item_name": string | null,"marketplace": string,"mp_order_id": number | null,"opened_at": string | null,"order_id": string | null,"raw": Json | null,"reason_title": string | null,"refund_id": string,"status_code": string | null,"status_title": string | null,"ttn": string | null,"updated_at": string
                  }
                  Insert: {
                    "first_seen_at"?: string,"item_name"?: string | null,"marketplace": string,"mp_order_id"?: number | null,"opened_at"?: string | null,"order_id"?: string | null,"raw"?: Json | null,"reason_title"?: string | null,"refund_id": string,"status_code"?: string | null,"status_title"?: string | null,"ttn"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "first_seen_at"?: string,"item_name"?: string | null,"marketplace"?: string,"mp_order_id"?: number | null,"opened_at"?: string | null,"order_id"?: string | null,"raw"?: Json | null,"reason_title"?: string | null,"refund_id"?: string,"status_code"?: string | null,"status_title"?: string | null,"ttn"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_refunds_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_status_map": {
                  Row: {
                    "external_status": string,"marketplace_id": number,"our_status": string
                  }
                  Insert: {
                    "external_status": string,"marketplace_id": number,"our_status": string
                  }
                  Update: {
                    "external_status"?: string,"marketplace_id"?: number,"our_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_status_map_marketplace_id_fkey"
      columns: ["marketplace_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_sync_log": {
                  Row: {
                    "direction": string,"error_details": string | null,"finished_at": string | null,"id": number,"marketplace_id": number,"records_error": number,"records_ok": number,"records_skipped": number,"records_total": number,"started_at": string,"status": string,"sync_type": string,"triggered_by": string
                  }
                  Insert: {
                    "direction": string,"error_details"?: string | null,"finished_at"?: string | null,"id"?: number,"marketplace_id": number,"records_error"?: number,"records_ok"?: number,"records_skipped"?: number,"records_total"?: number,"started_at"?: string,"status"?: string,"sync_type": string,"triggered_by"?: string
                  }
                  Update: {
                    "direction"?: string,"error_details"?: string | null,"finished_at"?: string | null,"id"?: number,"marketplace_id"?: number,"records_error"?: number,"records_ok"?: number,"records_skipped"?: number,"records_total"?: number,"started_at"?: string,"status"?: string,"sync_type"?: string,"triggered_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_sync_log_marketplace_id_fkey"
      columns: ["marketplace_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_sync_queue": {
                  Row: {
                    "attempts": number,"error_message": string | null,"id": number,"last_attempt_at": string | null,"listing_id": number,"marketplace_id": number,"max_attempts": number,"payload": NonNullable<Json>,"queued_at": string,"retry_after": string | null,"sku": string,"status": string,"sync_type": string
                  }
                  Insert: {
                    "attempts"?: number,"error_message"?: string | null,"id"?: number,"last_attempt_at"?: string | null,"listing_id": number,"marketplace_id": number,"max_attempts"?: number,"payload"?: NonNullable<Json>,"queued_at"?: string,"retry_after"?: string | null,"sku": string,"status"?: string,"sync_type": string
                  }
                  Update: {
                    "attempts"?: number,"error_message"?: string | null,"id"?: number,"last_attempt_at"?: string | null,"listing_id"?: number,"marketplace_id"?: number,"max_attempts"?: number,"payload"?: NonNullable<Json>,"queued_at"?: string,"retry_after"?: string | null,"sku"?: string,"status"?: string,"sync_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_sync_queue_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "marketplace_listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_sync_queue_marketplace_id_fkey"
      columns: ["marketplace_id"]
isOneToOne: false
      referencedRelation: "marketplace_accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"money_entries": {
                  Row: {
                    "account_type": string,"amount": number,"business_date": string,"contract_id": string | null,"counterparty_id": string | null,"created_at": string | null,"created_by": string | null,"currency": string,"description": string | null,"doc_id": string | null,"doc_type": string | null,"id": string,"idempotency_key": string | null,"meta": Json | null,"order_id": string | null,"rate": number,"supplier_contract_id": string | null,"txn_id": string
                  }
                  Insert: {
                    "account_type": string,"amount": number,"business_date": string,"contract_id"?: string | null,"counterparty_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"doc_id"?: string | null,"doc_type"?: string | null,"id"?: string,"idempotency_key"?: string | null,"meta"?: Json | null,"order_id"?: string | null,"rate"?: number,"supplier_contract_id"?: string | null,"txn_id": string
                  }
                  Update: {
                    "account_type"?: string,"amount"?: number,"business_date"?: string,"contract_id"?: string | null,"counterparty_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"doc_id"?: string | null,"doc_type"?: string | null,"id"?: string,"idempotency_key"?: string | null,"meta"?: Json | null,"order_id"?: string | null,"rate"?: number,"supplier_contract_id"?: string | null,"txn_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_money_contract"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_aging"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "fk_money_contract"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_balances"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "fk_money_contract"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "customer_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_entries_doc_id_fkey"
      columns: ["doc_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_entries_doc_id_fkey"
      columns: ["doc_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_entries_doc_id_fkey"
      columns: ["doc_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "money_entries_supplier_contract_id_fkey"
      columns: ["supplier_contract_id"]
isOneToOne: false
      referencedRelation: "supplier_contracts"
      referencedColumns: ["id"]
    }
                  ]
                },"mono_bank_txns": {
                  Row: {
                    "account": string | null,"amount": number,"category": string | null,"comment": string | null,"counter_edrpou": string | null,"counter_iban": string | null,"counter_name": string | null,"created_at": string,"description": string | null,"direction": string,"id": string,"matched_order_id": string | null,"note": string | null,"order_payment_id": string | null,"posted_at": string | null,"posted_by": string | null,"raw": Json | null,"status": string,"txn_id": string | null,"txn_time": string | null
                  }
                  Insert: {
                    "account"?: string | null,"amount": number,"category"?: string | null,"comment"?: string | null,"counter_edrpou"?: string | null,"counter_iban"?: string | null,"counter_name"?: string | null,"created_at"?: string,"description"?: string | null,"direction"?: string,"id": string,"matched_order_id"?: string | null,"note"?: string | null,"order_payment_id"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"raw"?: Json | null,"status"?: string,"txn_id"?: string | null,"txn_time"?: string | null
                  }
                  Update: {
                    "account"?: string | null,"amount"?: number,"category"?: string | null,"comment"?: string | null,"counter_edrpou"?: string | null,"counter_iban"?: string | null,"counter_name"?: string | null,"created_at"?: string,"description"?: string | null,"direction"?: string,"id"?: string,"matched_order_id"?: string | null,"note"?: string | null,"order_payment_id"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"raw"?: Json | null,"status"?: string,"txn_id"?: string | null,"txn_time"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "mono_bank_txns_matched_order_id_fkey"
      columns: ["matched_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"novapay_txns": {
                  Row: {
                    "account": string | null,"amount": number,"category": string | null,"code": string | null,"counterparty": string | null,"created_at": string,"direction": string,"id": string,"kind": string,"note": string | null,"posted_at": string | null,"posted_by": string | null,"purpose": string | null,"raw": Json | null,"register_no": string | null,"status": string,"txn_date": string,"txn_id": string | null
                  }
                  Insert: {
                    "account"?: string | null,"amount": number,"category"?: string | null,"code"?: string | null,"counterparty"?: string | null,"created_at"?: string,"direction": string,"id": string,"kind"?: string,"note"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"purpose"?: string | null,"raw"?: Json | null,"register_no"?: string | null,"status"?: string,"txn_date": string,"txn_id"?: string | null
                  }
                  Update: {
                    "account"?: string | null,"amount"?: number,"category"?: string | null,"code"?: string | null,"counterparty"?: string | null,"created_at"?: string,"direction"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"posted_at"?: string | null,"posted_by"?: string | null,"purpose"?: string | null,"raw"?: Json | null,"register_no"?: string | null,"status"?: string,"txn_date"?: string,"txn_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"order_edits": {
                  Row: {
                    "at": string,"blocked": boolean,"date_after": string | null,"date_before": string | null,"document_id": string | null,"edited_by": string | null,"id": string,"issues": NonNullable<Json>,"items_after": Json | null,"items_before": Json | null,"order_id": string | null,"source": string,"total_after": number | null,"total_before": number | null
                  }
                  Insert: {
                    "at"?: string,"blocked"?: boolean,"date_after"?: string | null,"date_before"?: string | null,"document_id"?: string | null,"edited_by"?: string | null,"id"?: string,"issues"?: NonNullable<Json>,"items_after"?: Json | null,"items_before"?: Json | null,"order_id"?: string | null,"source": string,"total_after"?: number | null,"total_before"?: number | null
                  }
                  Update: {
                    "at"?: string,"blocked"?: boolean,"date_after"?: string | null,"date_before"?: string | null,"document_id"?: string | null,"edited_by"?: string | null,"id"?: string,"issues"?: NonNullable<Json>,"items_after"?: Json | null,"items_before"?: Json | null,"order_id"?: string | null,"source"?: string,"total_after"?: number | null,"total_before"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"order_number_seq": {
                  Row: {
                    "last_val": number,"ym": string
                  }
                  Insert: {
                    "last_val"?: number,"ym": string
                  }
                  Update: {
                    "last_val"?: number,"ym"?: string
                  }
                  Relationships: [
                    
                  ]
                },"order_payments": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"doc_id": string | null,"id": string,"note": string | null,"order_id": string,"payment_date": string,"payment_mode": string,"reversed": boolean,"reversed_at": string | null,"reversed_by": string | null
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"doc_id"?: string | null,"id"?: string,"note"?: string | null,"order_id": string,"payment_date"?: string,"payment_mode"?: string,"reversed"?: boolean,"reversed_at"?: string | null,"reversed_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"doc_id"?: string | null,"id"?: string,"note"?: string | null,"order_id"?: string,"payment_date"?: string,"payment_mode"?: string,"reversed"?: boolean,"reversed_at"?: string | null,"reversed_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"id": number,"notes": string | null,"order_id": string,"status_from": string | null,"status_to": string
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"id"?: number,"notes"?: string | null,"order_id": string,"status_from"?: string | null,"status_to": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"id"?: number,"notes"?: string | null,"order_id"?: string,"status_from"?: string | null,"status_to"?: string
                  }
                  Relationships: [
                    
                  ]
                },"orders": {
                  Row: {
                    "amount_paid": number,"callback_done": boolean | null,"cancelled_at": string | null,"carrier_accepted_at": string | null,"carrier_delivered_at": string | null,"carrier_status_synced_at": string | null,"carrier_status_text": string | null,"channel_code": string | null,"comment": string | null,"company": string | null,"confirmed_at": string | null,"contact": string,"contract_id": string | null,"created_at": string | null,"customer_id": string | null,"delivered_at": string | null,"delivery_address": string | null,"delivery_city_name": string | null,"delivery_city_ref": string | null,"delivery_subtype": string | null,"delivery_type": string,"delivery_warehouse_ref": string | null,"discount_amount": number | null,"discount_pct": number,"email": string,"epicentr_data": Json | null,"epicentr_order_id": string | null,"flags": (string)[],"fulfillment_mode": string | null,"gclid": string | null,"id": string,"internal_note": string | null,"invoice_as_company": boolean,"invoice_options": Json | null,"items": NonNullable<Json>,"mp_refund_status": string | null,"np_delivery_cost": number | null,"np_delivery_payer": string | null,"np_return_created_at": string | null,"np_return_number": string | null,"np_return_ref": string | null,"np_return_tracking": Json | null,"np_return_ttn": string | null,"order_number": number,"partner_code": string | null,"payment_confirmed": boolean | null,"payment_due_date": string | null,"payment_method_code": string | null,"payment_reference": string | null,"payment_type": string,"phone": string,"price_type": string | null,"prom_data": Json | null,"prom_order_id": number | null,"promo_code": string | null,"promo_discount": number | null,"promo_id": string | null,"referrer_url": string | null,"review_reminder_sent_at": string | null,"review_request_sent_at": string | null,"review_token": string | null,"rozetka_data": Json | null,"rozetka_order_id": number | null,"rz_delivery_cost": number | null,"rz_delivery_payer": string | null,"rz_payment_fee": number | null,"ship_lock": string | null,"shipped_at": string | null,"shipping_supplier_id": number | null,"status": string | null,"status_history": Json | null,"supplier_confirmed": boolean,"supplier_sent_at": string | null,"telegram_chat_id": string | null,"total_price": number,"tracking_number": string | null,"tracking_ref": string | null,"user_id": string | null,"utm_campaign": string | null,"utm_content": string | null,"utm_medium": string | null,"utm_source": string | null,"utm_term": string | null
                  }
                  Insert: {
                    "amount_paid"?: number,"callback_done"?: boolean | null,"cancelled_at"?: string | null,"carrier_accepted_at"?: string | null,"carrier_delivered_at"?: string | null,"carrier_status_synced_at"?: string | null,"carrier_status_text"?: string | null,"channel_code"?: string | null,"comment"?: string | null,"company"?: string | null,"confirmed_at"?: string | null,"contact": string,"contract_id"?: string | null,"created_at"?: string | null,"customer_id"?: string | null,"delivered_at"?: string | null,"delivery_address"?: string | null,"delivery_city_name"?: string | null,"delivery_city_ref"?: string | null,"delivery_subtype"?: string | null,"delivery_type": string,"delivery_warehouse_ref"?: string | null,"discount_amount"?: number | null,"discount_pct"?: number,"email": string,"epicentr_data"?: Json | null,"epicentr_order_id"?: string | null,"flags"?: (string)[],"fulfillment_mode"?: string | null,"gclid"?: string | null,"id"?: string,"internal_note"?: string | null,"invoice_as_company"?: boolean,"invoice_options"?: Json | null,"items": NonNullable<Json>,"mp_refund_status"?: string | null,"np_delivery_cost"?: number | null,"np_delivery_payer"?: string | null,"np_return_created_at"?: string | null,"np_return_number"?: string | null,"np_return_ref"?: string | null,"np_return_tracking"?: Json | null,"np_return_ttn"?: string | null,"order_number"?: number,"partner_code"?: string | null,"payment_confirmed"?: boolean | null,"payment_due_date"?: string | null,"payment_method_code"?: never,"payment_reference"?: string | null,"payment_type": string,"phone": string,"price_type"?: string | null,"prom_data"?: Json | null,"prom_order_id"?: number | null,"promo_code"?: string | null,"promo_discount"?: number | null,"promo_id"?: string | null,"referrer_url"?: string | null,"review_reminder_sent_at"?: string | null,"review_request_sent_at"?: string | null,"review_token"?: string | null,"rozetka_data"?: Json | null,"rozetka_order_id"?: number | null,"rz_delivery_cost"?: number | null,"rz_delivery_payer"?: string | null,"rz_payment_fee"?: number | null,"ship_lock"?: string | null,"shipped_at"?: string | null,"shipping_supplier_id"?: number | null,"status"?: string | null,"status_history"?: Json | null,"supplier_confirmed"?: boolean,"supplier_sent_at"?: string | null,"telegram_chat_id"?: string | null,"total_price": number,"tracking_number"?: string | null,"tracking_ref"?: string | null,"user_id"?: string | null,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null
                  }
                  Update: {
                    "amount_paid"?: number,"callback_done"?: boolean | null,"cancelled_at"?: string | null,"carrier_accepted_at"?: string | null,"carrier_delivered_at"?: string | null,"carrier_status_synced_at"?: string | null,"carrier_status_text"?: string | null,"channel_code"?: string | null,"comment"?: string | null,"company"?: string | null,"confirmed_at"?: string | null,"contact"?: string,"contract_id"?: string | null,"created_at"?: string | null,"customer_id"?: string | null,"delivered_at"?: string | null,"delivery_address"?: string | null,"delivery_city_name"?: string | null,"delivery_city_ref"?: string | null,"delivery_subtype"?: string | null,"delivery_type"?: string,"delivery_warehouse_ref"?: string | null,"discount_amount"?: number | null,"discount_pct"?: number,"email"?: string,"epicentr_data"?: Json | null,"epicentr_order_id"?: string | null,"flags"?: (string)[],"fulfillment_mode"?: string | null,"gclid"?: string | null,"id"?: string,"internal_note"?: string | null,"invoice_as_company"?: boolean,"invoice_options"?: Json | null,"items"?: NonNullable<Json>,"mp_refund_status"?: string | null,"np_delivery_cost"?: number | null,"np_delivery_payer"?: string | null,"np_return_created_at"?: string | null,"np_return_number"?: string | null,"np_return_ref"?: string | null,"np_return_tracking"?: Json | null,"np_return_ttn"?: string | null,"order_number"?: number,"partner_code"?: string | null,"payment_confirmed"?: boolean | null,"payment_due_date"?: string | null,"payment_method_code"?: never,"payment_reference"?: string | null,"payment_type"?: string,"phone"?: string,"price_type"?: string | null,"prom_data"?: Json | null,"prom_order_id"?: number | null,"promo_code"?: string | null,"promo_discount"?: number | null,"promo_id"?: string | null,"referrer_url"?: string | null,"review_reminder_sent_at"?: string | null,"review_request_sent_at"?: string | null,"review_token"?: string | null,"rozetka_data"?: Json | null,"rozetka_order_id"?: number | null,"rz_delivery_cost"?: number | null,"rz_delivery_payer"?: string | null,"rz_payment_fee"?: number | null,"ship_lock"?: string | null,"shipped_at"?: string | null,"shipping_supplier_id"?: number | null,"status"?: string | null,"status_history"?: Json | null,"supplier_confirmed"?: boolean,"supplier_sent_at"?: string | null,"telegram_chat_id"?: string | null,"total_price"?: number,"tracking_number"?: string | null,"tracking_ref"?: string | null,"user_id"?: string | null,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_channel_code_fkey"
      columns: ["channel_code"]
isOneToOne: false
      referencedRelation: "sales_channels"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "orders_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_aging"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "orders_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_balances"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "orders_contract_id_fkey"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "customer_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "partner_balance_reconciliation"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "orders_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "promo_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_shipping_supplier_id_fkey"
      columns: ["shipping_supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_balance_transactions": {
                  Row: {
                    "amount": number,"balance_after": number | null,"created_at": string,"created_by": string | null,"customer_id": string,"description": string,"external_ref": string | null,"id": number,"order_id": string | null,"tx_type": string
                  }
                  Insert: {
                    "amount": number,"balance_after"?: number | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"description"?: string,"external_ref"?: string | null,"id"?: number,"order_id"?: string | null,"tx_type": string
                  }
                  Update: {
                    "amount"?: number,"balance_after"?: number | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"description"?: string,"external_ref"?: string | null,"id"?: number,"order_id"?: string | null,"tx_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_balance_transactions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_balance_transactions_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "partner_balance_reconciliation"
      referencedColumns: ["customer_id"]
    }
                  ]
                },"partner_payout_requests": {
                  Row: {
                    "amount": number,"bank_details": string | null,"customer_id": string,"id": string,"method": string,"notes": string | null,"processed_at": string | null,"processed_by": string | null,"requested_at": string,"status": string
                  }
                  Insert: {
                    "amount": number,"bank_details"?: string | null,"customer_id": string,"id"?: string,"method"?: string,"notes"?: string | null,"processed_at"?: string | null,"processed_by"?: string | null,"requested_at"?: string,"status"?: string
                  }
                  Update: {
                    "amount"?: number,"bank_details"?: string | null,"customer_id"?: string,"id"?: string,"method"?: string,"notes"?: string | null,"processed_at"?: string | null,"processed_by"?: string | null,"requested_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_payout_requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_payout_requests_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "partner_balance_reconciliation"
      referencedColumns: ["customer_id"]
    }
                  ]
                },"pending_card_orders": {
                  Row: {
                    "created_at": string | null,"email": string | null,"id": string,"payload": NonNullable<Json>,"reference": string,"total_price": number,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"email"?: string | null,"id"?: string,"payload": NonNullable<Json>,"reference": string,"total_price": number,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"email"?: string | null,"id"?: string,"payload"?: NonNullable<Json>,"reference"?: string,"total_price"?: number,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"pos_sessions": {
                  Row: {
                    "closed_at": string | null,"closed_by": string | null,"closing_cash": number | null,"created_at": string | null,"fiscal_session_data": Json | null,"fiscal_session_id": string | null,"id": number,"opened_at": string,"opened_by": string | null,"opening_cash": number,"session_number": string,"status": string,"terminal_id": number
                  }
                  Insert: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"closing_cash"?: number | null,"created_at"?: string | null,"fiscal_session_data"?: Json | null,"fiscal_session_id"?: string | null,"id"?: number,"opened_at"?: string,"opened_by"?: string | null,"opening_cash"?: number,"session_number": string,"status"?: string,"terminal_id": number
                  }
                  Update: {
                    "closed_at"?: string | null,"closed_by"?: string | null,"closing_cash"?: number | null,"created_at"?: string | null,"fiscal_session_data"?: Json | null,"fiscal_session_id"?: string | null,"id"?: number,"opened_at"?: string,"opened_by"?: string | null,"opening_cash"?: number,"session_number"?: string,"status"?: string,"terminal_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_sessions_terminal_id_fkey"
      columns: ["terminal_id"]
isOneToOne: false
      referencedRelation: "pos_terminals"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_terminals": {
                  Row: {
                    "created_at": string | null,"fiscal_id": string | null,"fiscal_system": string | null,"id": number,"is_active": boolean,"name": string,"settings": NonNullable<Json>,"warehouse_id": number
                  }
                  Insert: {
                    "created_at"?: string | null,"fiscal_id"?: string | null,"fiscal_system"?: string | null,"id"?: number,"is_active"?: boolean,"name": string,"settings"?: NonNullable<Json>,"warehouse_id": number
                  }
                  Update: {
                    "created_at"?: string | null,"fiscal_id"?: string | null,"fiscal_system"?: string | null,"id"?: number,"is_active"?: boolean,"name"?: string,"settings"?: NonNullable<Json>,"warehouse_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_terminals_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"price_change_log": {
                  Row: {
                    "comment": string | null,"count": number | null,"created_at": string | null,"effective_from": string | null,"id": number,"is_promo": boolean | null,"revert_at": string | null,"reverted_at": string | null,"snapshot": Json | null,"status": string,"target": string,"type": string,"user_id": string | null,"value": number
                  }
                  Insert: {
                    "comment"?: string | null,"count"?: number | null,"created_at"?: string | null,"effective_from"?: string | null,"id"?: number,"is_promo"?: boolean | null,"revert_at"?: string | null,"reverted_at"?: string | null,"snapshot"?: Json | null,"status"?: string,"target": string,"type": string,"user_id"?: string | null,"value": number
                  }
                  Update: {
                    "comment"?: string | null,"count"?: number | null,"created_at"?: string | null,"effective_from"?: string | null,"id"?: number,"is_promo"?: boolean | null,"revert_at"?: string | null,"reverted_at"?: string | null,"snapshot"?: Json | null,"status"?: string,"target"?: string,"type"?: string,"user_id"?: string | null,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"price_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"id": number,"price_new": number,"price_old": number | null,"price_type": string,"sku": string,"source": string | null
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"id"?: number,"price_new": number,"price_old"?: number | null,"price_type": string,"sku": string,"source"?: string | null
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"id"?: number,"price_new"?: number,"price_old"?: number | null,"price_type"?: string,"sku"?: string,"source"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_history_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "price_history_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "price_history_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"price_lists": {
                  Row: {
                    "code": string,"created_at": string | null,"currency": string,"id": number,"is_active": boolean,"is_default": boolean,"name": string,"notes": string | null,"type": string,"valid_from": string | null,"valid_until": string | null
                  }
                  Insert: {
                    "code": string,"created_at"?: string | null,"currency"?: string,"id"?: number,"is_active"?: boolean,"is_default"?: boolean,"name": string,"notes"?: string | null,"type": string,"valid_from"?: string | null,"valid_until"?: string | null
                  }
                  Update: {
                    "code"?: string,"created_at"?: string | null,"currency"?: string,"id"?: number,"is_active"?: boolean,"is_default"?: boolean,"name"?: string,"notes"?: string | null,"type"?: string,"valid_from"?: string | null,"valid_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"pricing_rules": {
                  Row: {
                    "brand": string | null,"category_slug": string | null,"cost_from": number | null,"cost_to": number | null,"created_at": string,"exclude_single": boolean,"id": number,"is_active": boolean,"marketplace": string,"markup_pct": number | null,"min_price_uah": number | null,"min_profit_uah": number | null,"note": string | null,"round_step": number | null,"scope": string,"sku": string | null,"updated_at": string
                  }
                  Insert: {
                    "brand"?: string | null,"category_slug"?: string | null,"cost_from"?: number | null,"cost_to"?: number | null,"created_at"?: string,"exclude_single"?: boolean,"id"?: number,"is_active"?: boolean,"marketplace"?: string,"markup_pct"?: number | null,"min_price_uah"?: number | null,"min_profit_uah"?: number | null,"note"?: string | null,"round_step"?: number | null,"scope": string,"sku"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string | null,"category_slug"?: string | null,"cost_from"?: number | null,"cost_to"?: number | null,"created_at"?: string,"exclude_single"?: boolean,"id"?: number,"is_active"?: boolean,"marketplace"?: string,"markup_pct"?: number | null,"min_price_uah"?: number | null,"min_profit_uah"?: number | null,"note"?: string | null,"round_step"?: number | null,"scope"?: string,"sku"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pricing_rules_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "pricing_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "pricing_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "pricing_rules_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"product_characteristics": {
                  Row: {
                    "id": number,"label": string,"product_sku": string,"sort_order": number | null,"value": string
                  }
                  Insert: {
                    "id"?: number,"label": string,"product_sku": string,"sort_order"?: number | null,"value": string
                  }
                  Update: {
                    "id"?: number,"label"?: string,"product_sku"?: string,"sort_order"?: number | null,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_characteristics_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_characteristics_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_characteristics_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"product_faq": {
                  Row: {
                    "answer": string,"answer_ru": string | null,"created_at": string,"id": number,"product_sku": string,"question": string,"question_ru": string | null,"sort_order": number
                  }
                  Insert: {
                    "answer": string,"answer_ru"?: string | null,"created_at"?: string,"id"?: number,"product_sku": string,"question": string,"question_ru"?: string | null,"sort_order"?: number
                  }
                  Update: {
                    "answer"?: string,"answer_ru"?: string | null,"created_at"?: string,"id"?: number,"product_sku"?: string,"question"?: string,"question_ru"?: string | null,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_faq_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_faq_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_faq_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"product_prices": {
                  Row: {
                    "id": number,"min_qty": number,"price": number,"price_list_id": number,"sku": string,"updated_at": string | null
                  }
                  Insert: {
                    "id"?: number,"min_qty"?: number,"price": number,"price_list_id": number,"sku": string,"updated_at"?: string | null
                  }
                  Update: {
                    "id"?: number,"min_qty"?: number,"price"?: number,"price_list_id"?: number,"sku"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_prices_price_list_id_fkey"
      columns: ["price_list_id"]
isOneToOne: false
      referencedRelation: "price_lists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_prices_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_prices_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_prices_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"product_reviews": {
                  Row: {
                    "author_name": string,"created_at": string | null,"id": string,"is_approved": boolean | null,"is_verified": boolean,"order_id": string | null,"product_sku": string,"rating": number,"review_text": string | null
                  }
                  Insert: {
                    "author_name": string,"created_at"?: string | null,"id"?: string,"is_approved"?: boolean | null,"is_verified"?: boolean,"order_id"?: string | null,"product_sku": string,"rating": number,"review_text"?: string | null
                  }
                  Update: {
                    "author_name"?: string,"created_at"?: string | null,"id"?: string,"is_approved"?: boolean | null,"is_verified"?: boolean,"order_id"?: string | null,"product_sku"?: string,"rating"?: number,"review_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_reviews_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_reviews_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_reviews_product_sku_fkey"
      columns: ["product_sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"product_stock": {
                  Row: {
                    "id": number,"price_cost": number | null,"price_drop": number | null,"price_locked": boolean | null,"price_old": number | null,"price_promo": number | null,"price_retail": number | null,"price_retail_old": number | null,"price_unit": number,"price_wholesale": number | null,"sku": string,"stock_qty": number,"stock_status": string,"supplier_sku": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "id"?: number,"price_cost"?: number | null,"price_drop"?: number | null,"price_locked"?: boolean | null,"price_old"?: number | null,"price_promo"?: number | null,"price_retail"?: number | null,"price_retail_old"?: number | null,"price_unit"?: number,"price_wholesale"?: number | null,"sku": string,"stock_qty"?: number,"stock_status"?: string,"supplier_sku"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "id"?: number,"price_cost"?: number | null,"price_drop"?: number | null,"price_locked"?: boolean | null,"price_old"?: number | null,"price_promo"?: number | null,"price_retail"?: number | null,"price_retail_old"?: number | null,"price_unit"?: number,"price_wholesale"?: number | null,"sku"?: string,"stock_qty"?: number,"stock_status"?: string,"supplier_sku"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_stock_sku_fkey"
      columns: ["sku"]
isOneToOne: true
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_stock_sku_fkey"
      columns: ["sku"]
isOneToOne: true
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "product_stock_sku_fkey"
      columns: ["sku"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"products": {
                  Row: {
                    "ac": string | null,"base_uom": string | null,"bc": string | null,"brand": string,"category_slug": string | null,"color": string | null,"created_at": string | null,"description": string | null,"description_full": string | null,"description_full_ru": string | null,"description_mp": string | null,"description_mp_ru": string | null,"description_ru": string | null,"epicentr_markup_pct": number | null,"gtin": string | null,"id": number,"image": string | null,"img_type": string | null,"is_active": boolean | null,"is_hit": boolean | null,"is_new": boolean | null,"keywords": string | null,"keywords_ru": string | null,"min_order": number,"min_price": number | null,"name": string,"name_ru": string | null,"nl1": string | null,"nl2": string | null,"on_epicentr": boolean,"on_prom": boolean | null,"on_rozetka": boolean | null,"pack_qty": number,"product_type": string | null,"prom_markup_pct": number | null,"prom_portal_url": string | null,"purchase_ratio": number,"purchase_uom": string | null,"purchase_uom_factor": number,"rozetka_markup_pct": number | null,"rozetka_name": string | null,"rozetka_smart": boolean,"sale_ratio": number,"sale_uom": string | null,"sku": string,"slug": string | null,"sort_order": number | null,"supplier_sku": string | null,"updated_at": string | null,"variant_canonical": boolean,"variant_main_sku": string | null,"volume": string | null
                  }
                  Insert: {
                    "ac"?: string | null,"base_uom"?: string | null,"bc"?: string | null,"brand": string,"category_slug"?: string | null,"color"?: string | null,"created_at"?: string | null,"description"?: string | null,"description_full"?: string | null,"description_full_ru"?: string | null,"description_mp"?: string | null,"description_mp_ru"?: string | null,"description_ru"?: string | null,"epicentr_markup_pct"?: number | null,"gtin"?: string | null,"id"?: number,"image"?: string | null,"img_type"?: string | null,"is_active"?: boolean | null,"is_hit"?: boolean | null,"is_new"?: boolean | null,"keywords"?: string | null,"keywords_ru"?: string | null,"min_order"?: number,"min_price"?: number | null,"name": string,"name_ru"?: string | null,"nl1"?: string | null,"nl2"?: string | null,"on_epicentr"?: boolean,"on_prom"?: boolean | null,"on_rozetka"?: boolean | null,"pack_qty"?: number,"product_type"?: string | null,"prom_markup_pct"?: number | null,"prom_portal_url"?: string | null,"purchase_ratio"?: number,"purchase_uom"?: string | null,"purchase_uom_factor"?: number,"rozetka_markup_pct"?: number | null,"rozetka_name"?: string | null,"rozetka_smart"?: boolean,"sale_ratio"?: number,"sale_uom"?: string | null,"sku": string,"slug"?: string | null,"sort_order"?: number | null,"supplier_sku"?: string | null,"updated_at"?: string | null,"variant_canonical"?: boolean,"variant_main_sku"?: string | null,"volume"?: string | null
                  }
                  Update: {
                    "ac"?: string | null,"base_uom"?: string | null,"bc"?: string | null,"brand"?: string,"category_slug"?: string | null,"color"?: string | null,"created_at"?: string | null,"description"?: string | null,"description_full"?: string | null,"description_full_ru"?: string | null,"description_mp"?: string | null,"description_mp_ru"?: string | null,"description_ru"?: string | null,"epicentr_markup_pct"?: number | null,"gtin"?: string | null,"id"?: number,"image"?: string | null,"img_type"?: string | null,"is_active"?: boolean | null,"is_hit"?: boolean | null,"is_new"?: boolean | null,"keywords"?: string | null,"keywords_ru"?: string | null,"min_order"?: number,"min_price"?: number | null,"name"?: string,"name_ru"?: string | null,"nl1"?: string | null,"nl2"?: string | null,"on_epicentr"?: boolean,"on_prom"?: boolean | null,"on_rozetka"?: boolean | null,"pack_qty"?: number,"product_type"?: string | null,"prom_markup_pct"?: number | null,"prom_portal_url"?: string | null,"purchase_ratio"?: number,"purchase_uom"?: string | null,"purchase_uom_factor"?: number,"rozetka_markup_pct"?: number | null,"rozetka_name"?: string | null,"rozetka_smart"?: boolean,"sale_ratio"?: number,"sale_uom"?: string | null,"sku"?: string,"slug"?: string | null,"sort_order"?: number | null,"supplier_sku"?: string | null,"updated_at"?: string | null,"variant_canonical"?: boolean,"variant_main_sku"?: string | null,"volume"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_base_uom_fkey"
      columns: ["base_uom"]
isOneToOne: false
      referencedRelation: "uom"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "products_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "products_purchase_uom_fkey"
      columns: ["purchase_uom"]
isOneToOne: false
      referencedRelation: "uom"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "products_sale_uom_fkey"
      columns: ["sale_uom"]
isOneToOne: false
      referencedRelation: "uom"
      referencedColumns: ["code"]
    }
                  ]
                },"prom_attribute_values": {
                  Row: {
                    "id": number,"name_ru": string | null,"name_uk": string | null,"prom_attribute_id": number,"sort_order": number | null,"value_id": number
                  }
                  Insert: {
                    "id"?: number,"name_ru"?: string | null,"name_uk"?: string | null,"prom_attribute_id": number,"sort_order"?: number | null,"value_id": number
                  }
                  Update: {
                    "id"?: number,"name_ru"?: string | null,"name_uk"?: string | null,"prom_attribute_id"?: number,"sort_order"?: number | null,"value_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "prom_attribute_values_prom_attribute_id_fkey"
      columns: ["prom_attribute_id"]
isOneToOne: false
      referencedRelation: "prom_attributes"
      referencedColumns: ["id"]
    }
                  ]
                },"prom_attributes": {
                  Row: {
                    "attribute_id": number,"id": number,"measure_unit_uk": string | null,"name_ru": string | null,"name_uk": string,"prom_category_id": number,"sort_order": number | null,"type": string,"val_max": number | null,"val_min": number | null
                  }
                  Insert: {
                    "attribute_id": number,"id"?: number,"measure_unit_uk"?: string | null,"name_ru"?: string | null,"name_uk": string,"prom_category_id": number,"sort_order"?: number | null,"type": string,"val_max"?: number | null,"val_min"?: number | null
                  }
                  Update: {
                    "attribute_id"?: number,"id"?: number,"measure_unit_uk"?: string | null,"name_ru"?: string | null,"name_uk"?: string,"prom_category_id"?: number,"sort_order"?: number | null,"type"?: string,"val_max"?: number | null,"val_min"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"prom_commissions_ref": {
                  Row: {
                    "commission_ecom": number | null,"commission_more": number | null,"commission_single": number | null,"commission_turbo": number | null,"name": string,"path": string | null,"prom_category_id": number
                  }
                  Insert: {
                    "commission_ecom"?: number | null,"commission_more"?: number | null,"commission_single"?: number | null,"commission_turbo"?: number | null,"name": string,"path"?: string | null,"prom_category_id": number
                  }
                  Update: {
                    "commission_ecom"?: number | null,"commission_more"?: number | null,"commission_single"?: number | null,"commission_turbo"?: number | null,"name"?: string,"path"?: string | null,"prom_category_id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"promo_code_uses": {
                  Row: {
                    "customer_id": string | null,"discount_amount": number,"id": number,"order_id": string,"promo_id": string,"used_at": string
                  }
                  Insert: {
                    "customer_id"?: string | null,"discount_amount": number,"id"?: number,"order_id": string,"promo_id": string,"used_at"?: string
                  }
                  Update: {
                    "customer_id"?: string | null,"discount_amount"?: number,"id"?: number,"order_id"?: string,"promo_id"?: string,"used_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_code_uses_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_code_uses_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "partner_balance_reconciliation"
      referencedColumns: ["customer_id"]
    },{
      foreignKeyName: "promo_code_uses_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "promo_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"promo_codes": {
                  Row: {
                    "applicable_categories": (string)[] | null,"applicable_channels": (string)[] | null,"applicable_skus": (string)[] | null,"code": string,"created_at": string | null,"created_by": string | null,"customer_types": (string)[] | null,"description": string | null,"discount_type": string,"discount_value": number,"id": string,"is_active": boolean,"max_discount_amount": number | null,"max_uses": number | null,"max_uses_per_customer": number,"min_order_amount": number | null,"uses_count": number,"valid_from": string | null,"valid_until": string | null
                  }
                  Insert: {
                    "applicable_categories"?: (string)[] | null,"applicable_channels"?: (string)[] | null,"applicable_skus"?: (string)[] | null,"code": string,"created_at"?: string | null,"created_by"?: string | null,"customer_types"?: (string)[] | null,"description"?: string | null,"discount_type": string,"discount_value": number,"id"?: string,"is_active"?: boolean,"max_discount_amount"?: number | null,"max_uses"?: number | null,"max_uses_per_customer"?: number,"min_order_amount"?: number | null,"uses_count"?: number,"valid_from"?: string | null,"valid_until"?: string | null
                  }
                  Update: {
                    "applicable_categories"?: (string)[] | null,"applicable_channels"?: (string)[] | null,"applicable_skus"?: (string)[] | null,"code"?: string,"created_at"?: string | null,"created_by"?: string | null,"customer_types"?: (string)[] | null,"description"?: string | null,"discount_type"?: string,"discount_value"?: number,"id"?: string,"is_active"?: boolean,"max_discount_amount"?: number | null,"max_uses"?: number | null,"max_uses_per_customer"?: number,"min_order_amount"?: number | null,"uses_count"?: number,"valid_from"?: string | null,"valid_until"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rozetka_category_tree": {
                  Row: {
                    "commission_rz_id": string | null,"created_at": string | null,"name": string,"rz_id": string,"updated_at": string | null
                  }
                  Insert: {
                    "commission_rz_id"?: string | null,"created_at"?: string | null,"name": string,"rz_id": string,"updated_at"?: string | null
                  }
                  Update: {
                    "commission_rz_id"?: string | null,"created_at"?: string | null,"name"?: string,"rz_id"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rozetka_commission_brackets": {
                  Row: {
                    "base_pct": number,"brand": string,"category_name": string | null,"id": number,"price_from": number,"price_to": number,"rz_id": string,"source": string,"updated_at": string
                  }
                  Insert: {
                    "base_pct": number,"brand"?: string,"category_name"?: string | null,"id"?: never,"price_from"?: number,"price_to": number,"rz_id": string,"source"?: string,"updated_at"?: string
                  }
                  Update: {
                    "base_pct"?: number,"brand"?: string,"category_name"?: string | null,"id"?: never,"price_from"?: number,"price_to"?: number,"rz_id"?: string,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rozetka_commission_refs": {
                  Row: {
                    "commission_pct": number | null,"name": string,"rz_id": string,"updated_at": string | null
                  }
                  Insert: {
                    "commission_pct"?: number | null,"name": string,"rz_id": string,"updated_at"?: string | null
                  }
                  Update: {
                    "commission_pct"?: number | null,"name"?: string,"rz_id"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rozetka_moderation_state": {
                  Row: {
                    "change_status": string | null,"checked_at": string,"reasons": (string)[],"sku": string
                  }
                  Insert: {
                    "change_status"?: string | null,"checked_at"?: string,"reasons"?: (string)[],"sku": string
                  }
                  Update: {
                    "change_status"?: string | null,"checked_at"?: string,"reasons"?: (string)[],"sku"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sales_channels": {
                  Row: {
                    "code": string,"is_active": boolean,"name": string,"sort_order": number | null,"type": string
                  }
                  Insert: {
                    "code": string,"is_active"?: boolean,"name": string,"sort_order"?: number | null,"type": string
                  }
                  Update: {
                    "code"?: string,"is_active"?: boolean,"name"?: string,"sort_order"?: number | null,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"search_demand": {
                  Row: {
                    "category_slug": string,"covered_path": string | null,"first_seen": string,"gsc_impressions": number | null,"gsc_position": number | null,"lang": string,"last_seen": string,"modifier": string,"phrase": string,"seen": number
                  }
                  Insert: {
                    "category_slug": string,"covered_path"?: string | null,"first_seen"?: string,"gsc_impressions"?: number | null,"gsc_position"?: number | null,"lang": string,"last_seen"?: string,"modifier"?: string,"phrase": string,"seen"?: number
                  }
                  Update: {
                    "category_slug"?: string,"covered_path"?: string | null,"first_seen"?: string,"gsc_impressions"?: number | null,"gsc_position"?: number | null,"lang"?: string,"last_seen"?: string,"modifier"?: string,"phrase"?: string,"seen"?: number
                  }
                  Relationships: [
                    
                  ]
                },"search_queries": {
                  Row: {
                    "created_at": string | null,"id": string,"query": string,"results_count": number | null,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"query": string,"results_count"?: number | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"query"?: string,"results_count"?: number | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"seo_actions": {
                  Row: {
                    "action": string,"cost_usd": number | null,"created_at": string,"created_by": string | null,"id": number,"meta": NonNullable<Json>,"page_path": string,"query": string | null
                  }
                  Insert: {
                    "action": string,"cost_usd"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: number,"meta"?: NonNullable<Json>,"page_path": string,"query"?: string | null
                  }
                  Update: {
                    "action"?: string,"cost_usd"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: number,"meta"?: NonNullable<Json>,"page_path"?: string,"query"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"showcase_items": {
                  Row: {
                    "created_at": string,"position": number,"sku": string,"surface": string
                  }
                  Insert: {
                    "created_at"?: string,"position"?: number,"sku": string,"surface": string
                  }
                  Update: {
                    "created_at"?: string,"position"?: number,"sku"?: string,"surface"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "showcase_items_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "showcase_items_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "showcase_items_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"stock_balance": {
                  Row: {
                    "avg_cost": number,"min_reorder_qty": number | null,"qty_available": number | null,"qty_reserved": number,"qty_total": number,"sku": string,"updated_at": string | null,"warehouse_id": number
                  }
                  Insert: {
                    "avg_cost"?: number,"min_reorder_qty"?: number | null,"qty_available"?: never,"qty_reserved"?: number,"qty_total"?: number,"sku": string,"updated_at"?: string | null,"warehouse_id": number
                  }
                  Update: {
                    "avg_cost"?: number,"min_reorder_qty"?: number | null,"qty_available"?: never,"qty_reserved"?: number,"qty_total"?: number,"sku"?: string,"updated_at"?: string | null,"warehouse_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_balance_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_balance_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_balance_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_balance_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_batches": {
                  Row: {
                    "cost_price": number,"created_at": string | null,"document_id": string | null,"id": string,"initial_qty": number,"received_at": string,"remaining_qty": number,"sku": string,"supplier_id": number | null,"warehouse_id": number
                  }
                  Insert: {
                    "cost_price"?: number,"created_at"?: string | null,"document_id"?: string | null,"id"?: string,"initial_qty": number,"received_at"?: string,"remaining_qty": number,"sku": string,"supplier_id"?: number | null,"warehouse_id": number
                  }
                  Update: {
                    "cost_price"?: number,"created_at"?: string | null,"document_id"?: string | null,"id"?: string,"initial_qty"?: number,"received_at"?: string,"remaining_qty"?: number,"sku"?: string,"supplier_id"?: number | null,"warehouse_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_batches_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_batches_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_batches_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "stock_batches_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_batches_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_batches_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_batches_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_batches_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_movements": {
                  Row: {
                    "batch_cost": number | null,"cost_price": number | null,"doc_type": string,"document_id": string,"document_line_id": number | null,"id": number,"meta": NonNullable<Json>,"moved_at": string,"order_id": string | null,"qty": number,"sale_price": number | null,"sku": string,"supplier_id": number | null,"warehouse_id": number
                  }
                  Insert: {
                    "batch_cost"?: number | null,"cost_price"?: number | null,"doc_type": string,"document_id": string,"document_line_id"?: number | null,"id"?: number,"meta"?: NonNullable<Json>,"moved_at"?: string,"order_id"?: string | null,"qty": number,"sale_price"?: number | null,"sku": string,"supplier_id"?: number | null,"warehouse_id": number
                  }
                  Update: {
                    "batch_cost"?: number | null,"cost_price"?: number | null,"doc_type"?: string,"document_id"?: string,"document_line_id"?: number | null,"id"?: number,"meta"?: NonNullable<Json>,"moved_at"?: string,"order_id"?: string | null,"qty"?: number,"sale_price"?: number | null,"sku"?: string,"supplier_id"?: number | null,"warehouse_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    },{
      foreignKeyName: "stock_movements_document_line_id_fkey"
      columns: ["document_line_id"]
isOneToOne: false
      referencedRelation: "acc_document_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_movements_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_movements_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_movements_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"stock_notifications": {
                  Row: {
                    "created_at": string | null,"email": string,"id": number,"product_name": string | null,"sku": string
                  }
                  Insert: {
                    "created_at"?: string | null,"email": string,"id"?: number,"product_name"?: string | null,"sku": string
                  }
                  Update: {
                    "created_at"?: string | null,"email"?: string,"id"?: number,"product_name"?: string | null,"sku"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stock_reservations": {
                  Row: {
                    "expires_at": string | null,"id": number,"order_id": string,"qty": number,"release_reason": string | null,"released_at": string | null,"reservation_status": string,"reserved_at": string,"sku": string,"warehouse_id": number
                  }
                  Insert: {
                    "expires_at"?: string | null,"id"?: number,"order_id": string,"qty": number,"release_reason"?: string | null,"released_at"?: string | null,"reservation_status"?: string,"reserved_at"?: string,"sku": string,"warehouse_id": number
                  }
                  Update: {
                    "expires_at"?: string | null,"id"?: number,"order_id"?: string,"qty"?: number,"release_reason"?: string | null,"released_at"?: string | null,"reservation_status"?: string,"reserved_at"?: string,"sku"?: string,"warehouse_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_reservations_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_reservations_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_reservations_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "stock_reservations_warehouse_id_fkey"
      columns: ["warehouse_id"]
isOneToOne: false
      referencedRelation: "warehouses"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_brand_discounts": {
                  Row: {
                    "brand": string,"discount_pct": number,"id": number,"keep_price": boolean | null,"markup_drop": number | null,"markup_retail": number | null,"markup_wholesale": number | null,"supplier_id": number
                  }
                  Insert: {
                    "brand": string,"discount_pct"?: number,"id"?: number,"keep_price"?: boolean | null,"markup_drop"?: number | null,"markup_retail"?: number | null,"markup_wholesale"?: number | null,"supplier_id": number
                  }
                  Update: {
                    "brand"?: string,"discount_pct"?: number,"id"?: number,"keep_price"?: boolean | null,"markup_drop"?: number | null,"markup_retail"?: number | null,"markup_wholesale"?: number | null,"supplier_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_brand_discounts_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_contracts": {
                  Row: {
                    "contract_number": string,"created_at": string | null,"created_by": string | null,"credit_days": number | null,"credit_limit": number | null,"currency": string | null,"discount_pct": number | null,"end_date": string | null,"id": string,"notes": string | null,"payment_terms": string | null,"start_date": string | null,"status": string | null,"supplier_id": number,"supplier_name": string,"updated_at": string | null
                  }
                  Insert: {
                    "contract_number": string,"created_at"?: string | null,"created_by"?: string | null,"credit_days"?: number | null,"credit_limit"?: number | null,"currency"?: string | null,"discount_pct"?: number | null,"end_date"?: string | null,"id"?: string,"notes"?: string | null,"payment_terms"?: string | null,"start_date"?: string | null,"status"?: string | null,"supplier_id": number,"supplier_name": string,"updated_at"?: string | null
                  }
                  Update: {
                    "contract_number"?: string,"created_at"?: string | null,"created_by"?: string | null,"credit_days"?: number | null,"credit_limit"?: number | null,"currency"?: string | null,"discount_pct"?: number | null,"end_date"?: string | null,"id"?: string,"notes"?: string | null,"payment_terms"?: string | null,"start_date"?: string | null,"status"?: string | null,"supplier_id"?: number,"supplier_name"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_contracts_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_payment_allocations": {
                  Row: {
                    "amount": number,"charge_entry_id": string,"created_at": string,"created_by": string | null,"id": string,"payment_entry_id": string
                  }
                  Insert: {
                    "amount": number,"charge_entry_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_entry_id": string
                  }
                  Update: {
                    "amount"?: number,"charge_entry_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_entry_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_payment_allocations_charge_entry_id_fkey"
      columns: ["charge_entry_id"]
isOneToOne: false
      referencedRelation: "ar_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payment_allocations_charge_entry_id_fkey"
      columns: ["charge_entry_id"]
isOneToOne: false
      referencedRelation: "money_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payment_allocations_payment_entry_id_fkey"
      columns: ["payment_entry_id"]
isOneToOne: false
      referencedRelation: "ar_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "supplier_payment_allocations_payment_entry_id_fkey"
      columns: ["payment_entry_id"]
isOneToOne: false
      referencedRelation: "money_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_product_overrides": {
                  Row: {
                    "fixed_drop": number | null,"fixed_retail": number | null,"fixed_wholesale": number | null,"markup_drop": number | null,"markup_retail": number | null,"markup_wholesale": number | null,"notes": string | null,"our_sku": string,"supplier_id": number,"updated_at": string | null
                  }
                  Insert: {
                    "fixed_drop"?: number | null,"fixed_retail"?: number | null,"fixed_wholesale"?: number | null,"markup_drop"?: number | null,"markup_retail"?: number | null,"markup_wholesale"?: number | null,"notes"?: string | null,"our_sku": string,"supplier_id": number,"updated_at"?: string | null
                  }
                  Update: {
                    "fixed_drop"?: number | null,"fixed_retail"?: number | null,"fixed_wholesale"?: number | null,"markup_drop"?: number | null,"markup_retail"?: number | null,"markup_wholesale"?: number | null,"notes"?: string | null,"our_sku"?: string,"supplier_id"?: number,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_product_overrides_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_product_overrides_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_product_overrides_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_product_overrides_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_promotions": {
                  Row: {
                    "apply_drop": boolean,"apply_retail": boolean,"apply_wholesale": boolean,"brand": string | null,"created_at": string | null,"ends_at": string | null,"id": number,"is_active": boolean,"name": string,"our_sku": string | null,"promo_type": string,"starts_at": string | null,"supplier_id": number,"value": number
                  }
                  Insert: {
                    "apply_drop"?: boolean,"apply_retail"?: boolean,"apply_wholesale"?: boolean,"brand"?: string | null,"created_at"?: string | null,"ends_at"?: string | null,"id"?: number,"is_active"?: boolean,"name": string,"our_sku"?: string | null,"promo_type"?: string,"starts_at"?: string | null,"supplier_id": number,"value": number
                  }
                  Update: {
                    "apply_drop"?: boolean,"apply_retail"?: boolean,"apply_wholesale"?: boolean,"brand"?: string | null,"created_at"?: string | null,"ends_at"?: string | null,"id"?: number,"is_active"?: boolean,"name"?: string,"our_sku"?: string | null,"promo_type"?: string,"starts_at"?: string | null,"supplier_id"?: number,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_promotions_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_promotions_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_promotions_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_promotions_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_sku_map": {
                  Row: {
                    "our_sku": string,"supplier_id": number,"supplier_sku": string
                  }
                  Insert: {
                    "our_sku": string,"supplier_id": number,"supplier_sku": string
                  }
                  Update: {
                    "our_sku"?: string,"supplier_id"?: number,"supplier_sku"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_sku_map_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_sku_map_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_sku_map_our_sku_fkey"
      columns: ["our_sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_sku_map_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_stock": {
                  Row: {
                    "last_synced_at": string,"price_cost": number | null,"price_unit": number | null,"priority_override": number | null,"sku": string,"stock_qty": number,"stock_status": string,"supplier_id": number,"supplier_sku": string | null,"updated_at": string
                  }
                  Insert: {
                    "last_synced_at"?: string,"price_cost"?: number | null,"price_unit"?: number | null,"priority_override"?: number | null,"sku": string,"stock_qty"?: number,"stock_status"?: string,"supplier_id": number,"supplier_sku"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "last_synced_at"?: string,"price_cost"?: number | null,"price_unit"?: number | null,"priority_override"?: number | null,"sku"?: string,"stock_qty"?: number,"stock_status"?: string,"supplier_id"?: number,"supplier_sku"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_stock_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_stock_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_stock_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "supplier_stock_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_sync_log": {
                  Row: {
                    "error_message": string | null,"finished_at": string | null,"id": number,"rows_skipped": number,"rows_total": number,"rows_unmapped": number,"rows_updated": number,"started_at": string,"supplier_id": number
                  }
                  Insert: {
                    "error_message"?: string | null,"finished_at"?: string | null,"id"?: number,"rows_skipped"?: number,"rows_total"?: number,"rows_unmapped"?: number,"rows_updated"?: number,"started_at"?: string,"supplier_id": number
                  }
                  Update: {
                    "error_message"?: string | null,"finished_at"?: string | null,"id"?: number,"rows_skipped"?: number,"rows_total"?: number,"rows_unmapped"?: number,"rows_updated"?: number,"started_at"?: string,"supplier_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_sync_log_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"supplier_unmapped_skus": {
                  Row: {
                    "first_seen_at": string,"price_in": number | null,"sample_name": string | null,"supplier_id": number,"supplier_sku": string
                  }
                  Insert: {
                    "first_seen_at"?: string,"price_in"?: number | null,"sample_name"?: string | null,"supplier_id": number,"supplier_sku": string
                  }
                  Update: {
                    "first_seen_at"?: string,"price_in"?: number | null,"sample_name"?: string | null,"supplier_id"?: number,"supplier_sku"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "supplier_unmapped_skus_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"suppliers": {
                  Row: {
                    "account_number": string | null,"bank_iban": string | null,"bank_name": string | null,"bank_swift": string | null,"col_name": string | null,"col_price": string | null,"col_qty": string | null,"col_sku": string | null,"contact_name": string | null,"contact_person": string | null,"contact_phone": string | null,"contacts": NonNullable<Json>,"created_at": string,"edrpou": string | null,"email": string | null,"file_format": string,"id": number,"is_active": boolean,"last_synced_at": string | null,"lead_time_days": number | null,"legal_name": string | null,"markup_drop": number,"markup_retail": number,"markup_wholesale": number,"min_order_amount": number | null,"name": string,"notes": string | null,"payment_days": number,"payment_terms": string | null,"payment_terms_days": number | null,"priority": number,"qty_is_flag": boolean | null,"return_policy": string | null,"slug": string,"source_url": string | null,"stock_always_available": boolean,"sync_interval_h": number
                  }
                  Insert: {
                    "account_number"?: string | null,"bank_iban"?: string | null,"bank_name"?: string | null,"bank_swift"?: string | null,"col_name"?: string | null,"col_price"?: string | null,"col_qty"?: string | null,"col_sku"?: string | null,"contact_name"?: string | null,"contact_person"?: string | null,"contact_phone"?: string | null,"contacts"?: NonNullable<Json>,"created_at"?: string,"edrpou"?: string | null,"email"?: string | null,"file_format"?: string,"id"?: number,"is_active"?: boolean,"last_synced_at"?: string | null,"lead_time_days"?: number | null,"legal_name"?: string | null,"markup_drop"?: number,"markup_retail"?: number,"markup_wholesale"?: number,"min_order_amount"?: number | null,"name": string,"notes"?: string | null,"payment_days"?: number,"payment_terms"?: string | null,"payment_terms_days"?: number | null,"priority"?: number,"qty_is_flag"?: boolean | null,"return_policy"?: string | null,"slug": string,"source_url"?: string | null,"stock_always_available"?: boolean,"sync_interval_h"?: number
                  }
                  Update: {
                    "account_number"?: string | null,"bank_iban"?: string | null,"bank_name"?: string | null,"bank_swift"?: string | null,"col_name"?: string | null,"col_price"?: string | null,"col_qty"?: string | null,"col_sku"?: string | null,"contact_name"?: string | null,"contact_person"?: string | null,"contact_phone"?: string | null,"contacts"?: NonNullable<Json>,"created_at"?: string,"edrpou"?: string | null,"email"?: string | null,"file_format"?: string,"id"?: number,"is_active"?: boolean,"last_synced_at"?: string | null,"lead_time_days"?: number | null,"legal_name"?: string | null,"markup_drop"?: number,"markup_retail"?: number,"markup_wholesale"?: number,"min_order_amount"?: number | null,"name"?: string,"notes"?: string | null,"payment_days"?: number,"payment_terms"?: string | null,"payment_terms_days"?: number | null,"priority"?: number,"qty_is_flag"?: boolean | null,"return_policy"?: string | null,"slug"?: string,"source_url"?: string | null,"stock_always_available"?: boolean,"sync_interval_h"?: number
                  }
                  Relationships: [
                    
                  ]
                },"sync_log": {
                  Row: {
                    "error_details": string | null,"finished_at": string | null,"id": number,"records_skipped": number | null,"records_total": number | null,"records_updated": number | null,"source": string,"started_at": string | null,"status": string
                  }
                  Insert: {
                    "error_details"?: string | null,"finished_at"?: string | null,"id"?: number,"records_skipped"?: number | null,"records_total"?: number | null,"records_updated"?: number | null,"source": string,"started_at"?: string | null,"status": string
                  }
                  Update: {
                    "error_details"?: string | null,"finished_at"?: string | null,"id"?: number,"records_skipped"?: number | null,"records_total"?: number | null,"records_updated"?: number | null,"source"?: string,"started_at"?: string | null,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"uom": {
                  Row: {
                    "code": string,"is_active": boolean,"name": string,"name_short": string,"sort_order": number | null,"type": string
                  }
                  Insert: {
                    "code": string,"is_active"?: boolean,"name": string,"name_short": string,"sort_order"?: number | null,"type": string
                  }
                  Update: {
                    "code"?: string,"is_active"?: boolean,"name"?: string,"name_short"?: string,"sort_order"?: number | null,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"uom_conversions": {
                  Row: {
                    "from_uom": string,"id": number,"ratio": number,"sku": string | null,"to_uom": string
                  }
                  Insert: {
                    "from_uom": string,"id"?: number,"ratio": number,"sku"?: string | null,"to_uom": string
                  }
                  Update: {
                    "from_uom"?: string,"id"?: number,"ratio"?: number,"sku"?: string | null,"to_uom"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "uom_conversions_from_uom_fkey"
      columns: ["from_uom"]
isOneToOne: false
      referencedRelation: "uom"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "uom_conversions_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "uom_conversions_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "uom_conversions_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "uom_conversions_to_uom_fkey"
      columns: ["to_uom"]
isOneToOne: false
      referencedRelation: "uom"
      referencedColumns: ["code"]
    }
                  ]
                },"warehouses": {
                  Row: {
                    "address": string | null,"created_at": string | null,"id": number,"is_active": boolean,"is_default": boolean,"name": string,"slug": string,"sort_order": number | null,"supplier_id": number | null,"warehouse_type": string
                  }
                  Insert: {
                    "address"?: string | null,"created_at"?: string | null,"id"?: number,"is_active"?: boolean,"is_default"?: boolean,"name": string,"slug": string,"sort_order"?: number | null,"supplier_id"?: number | null,"warehouse_type"?: string
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string | null,"id"?: number,"is_active"?: boolean,"is_default"?: boolean,"name"?: string,"slug"?: string,"sort_order"?: number | null,"supplier_id"?: number | null,"warehouse_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "warehouses_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"webhook_events": {
                  Row: {
                    "attempts": number,"event_type": string,"external_event_id": string | null,"id": string,"max_attempts": number,"processed_at": string | null,"processing_error": string | null,"raw_headers": NonNullable<Json>,"raw_payload": NonNullable<Json>,"received_at": string,"related_marketplace_order_id": string | null,"related_order_id": string | null,"retry_after": string | null,"source": string,"status": string
                  }
                  Insert: {
                    "attempts"?: number,"event_type": string,"external_event_id"?: string | null,"id"?: string,"max_attempts"?: number,"processed_at"?: string | null,"processing_error"?: string | null,"raw_headers"?: NonNullable<Json>,"raw_payload"?: NonNullable<Json>,"received_at"?: string,"related_marketplace_order_id"?: string | null,"related_order_id"?: string | null,"retry_after"?: string | null,"source": string,"status"?: string
                  }
                  Update: {
                    "attempts"?: number,"event_type"?: string,"external_event_id"?: string | null,"id"?: string,"max_attempts"?: number,"processed_at"?: string | null,"processing_error"?: string | null,"raw_headers"?: NonNullable<Json>,"raw_payload"?: NonNullable<Json>,"received_at"?: string,"related_marketplace_order_id"?: string | null,"related_order_id"?: string | null,"retry_after"?: string | null,"source"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "webhook_events_related_marketplace_order_id_fkey"
      columns: ["related_marketplace_order_id"]
isOneToOne: false
      referencedRelation: "marketplace_orders"
      referencedColumns: ["id"]
    }
                  ]
                },"wishlists": {
                  Row: {
                    "created_at": string | null,"id": string,"product_sku": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"product_sku": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"product_sku"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "admin_products_list": {
                  Row: {
                    "brand": string | null,"category_slug": string | null,"characteristics_count": number | null,"description_full_len": number | null,"description_full_ru_len": number | null,"has_description_ru": boolean | null,"has_keywords": boolean | null,"id": number | null,"image": string | null,"is_active": boolean | null,"is_hit": boolean | null,"is_new": boolean | null,"name": string | null,"name_ru": string | null,"sku": string | null,"sort_order": number | null,"updated_at": string | null,"volume": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    }
                  ]
                },"ar_aging": {
                  Row: {
                    "aging_bucket": string | null,"balance": number | null,"contract_id": string | null,"contract_number": string | null,"credit_days": number | null,"credit_limit": number | null,"customer_id": string | null,"customer_name": string | null,"days_overdue": number | null,"days_since_shipment": number | null,"last_ship_date": string | null,"limit_used_pct": number | null
                  }
                  Relationships: [
                    
                  ]
                },"ar_balances": {
                  Row: {
                    "balance": number | null,"contract_id": string | null,"contract_number": string | null,"contract_status": string | null,"credit_days": number | null,"credit_limit": number | null,"currency": string | null,"customer_id": string | null,"customer_name": string | null,"txn_count": number | null
                  }
                  Relationships: [
                    
                  ]
                },"ar_transactions": {
                  Row: {
                    "amount": number | null,"business_date": string | null,"contract_id": string | null,"contract_number": string | null,"created_at": string | null,"created_by": string | null,"currency": string | null,"customer_id": string | null,"customer_name": string | null,"description": string | null,"doc_id": string | null,"doc_type": string | null,"entry_type": string | null,"id": string | null,"order_id": string | null,"txn_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_money_contract"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_aging"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "fk_money_contract"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "ar_balances"
      referencedColumns: ["contract_id"]
    },{
      foreignKeyName: "fk_money_contract"
      columns: ["contract_id"]
isOneToOne: false
      referencedRelation: "customer_contracts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_entries_doc_id_fkey"
      columns: ["doc_id"]
isOneToOne: false
      referencedRelation: "acc_documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_entries_doc_id_fkey"
      columns: ["doc_id"]
isOneToOne: false
      referencedRelation: "open_purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_entries_doc_id_fkey"
      columns: ["doc_id"]
isOneToOne: false
      referencedRelation: "procurement_summary"
      referencedColumns: ["po_id"]
    }
                  ]
                },"open_purchase_orders": {
                  Row: {
                    "created_at": string | null,"created_by": string | null,"doc_date": string | null,"doc_number": string | null,"email_sent_at": string | null,"expected_date": string | null,"has_receipt": boolean | null,"id": string | null,"meta": Json | null,"notes": string | null,"order_id": string | null,"procurement_status": string | null,"supplier_email": string | null,"supplier_id": number | null,"supplier_invoice_amount": number | null,"supplier_invoice_date": string | null,"supplier_invoice_number": string | null,"supplier_name": string | null,"total_amount": number | null,"total_cost": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_documents_supplier_id_fkey"
      columns: ["supplier_id"]
isOneToOne: false
      referencedRelation: "suppliers"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_balance_reconciliation": {
                  Row: {
                    "balance_direct": number | null,"balance_ledger": number | null,"customer_id": string | null,"drift": number | null,"name": string | null
                  }
                  Relationships: [
                    
                  ]
                },"procurement_summary": {
                  Row: {
                    "adjustment_delta": number | null,"avg_cost": number | null,"effective_ordered_qty": number | null,"ordered_qty": number | null,"po_id": string | null,"received_qty": number | null,"remaining_qty": number | null,"returned_qty": number | null,"sku": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acc_document_lines_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "admin_products_list"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "acc_document_lines_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "product_seo_state"
      referencedColumns: ["sku"]
    },{
      foreignKeyName: "acc_document_lines_sku_fkey"
      columns: ["sku"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["sku"]
    }
                  ]
                },"product_seo_state": {
                  Row: {
                    "brand": string | null,"category_slug": string | null,"chars_count": number | null,"desc_len": number | null,"desc_ru_len": number | null,"faq_count": number | null,"faq_untranslated": number | null,"name": string | null,"no_image": boolean | null,"no_keywords": boolean | null,"no_ru": boolean | null,"sku": string | null,"slug": string | null
                  }
                  Insert: {
                           "brand"?: string | null,"category_slug"?: string | null,"chars_count"?: never,"desc_len"?: never,"desc_ru_len"?: never,"faq_count"?: never,"faq_untranslated"?: never,"name"?: string | null,"no_image"?: never,"no_keywords"?: never,"no_ru"?: never,"sku"?: string | null,"slug"?: string | null
                         }
                        Update: {
                           "brand"?: string | null,"category_slug"?: string | null,"chars_count"?: never,"desc_len"?: never,"desc_ru_len"?: never,"faq_count"?: never,"faq_untranslated"?: never,"name"?: string | null,"no_image"?: never,"no_keywords"?: never,"no_ru"?: never,"sku"?: string | null,"slug"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "products_category_slug_fkey"
      columns: ["category_slug"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["slug"]
    }
                  ]
                }
          }
          Functions: {
            "apply_landed_costs":
{ Args: { "p_document_id": string,"p_method": string }; Returns: number
                           },
"approve_payout":
{ Args: { "p_admin_email": string,"p_payout_id": string }; Returns: Json
                           },
"assert_period_open":
{ Args: { "p_date": string }; Returns: undefined
                           },
"bump_ai_bot_hit":
{ Args: { "p_bot": string,"p_section": string }; Returns: undefined
                           },
"bump_ai_referral":
{ Args: { "p_path": string,"p_source": string }; Returns: undefined
                           },
"charge_partner_balance":
{ Args: { "p_amount": number,"p_customer_id": string,"p_description"?: string,"p_order_id"?: string }; Returns: Json
                           },
"check_balance_integrity":
{ Args: Record<PropertyKey, never>; Returns: {
              "computed_balance": number,"customer_id": string,"drift": number,"stored_balance": number
            }[]
                           },
"check_invariants":
{ Args: Record<PropertyKey, never>; Returns: {
              "details": string,"invariant": string,"status": string
            }[]
                           },
"check_receipt_quantities":
{ Args: { "p_receipt_id": string }; Returns: {
              "already_received": number,"effective": number,"ordered": number,"sku": string,"this_receipt": number,"would_exceed": boolean
            }[]
                           },
"check_secdef_exposure":
{ Args: Record<PropertyKey, never>; Returns: {
              "func": string
            }[]
                           },
"close_period":
{ Args: { "p_by"?: string,"p_month": string }; Returns: string
                           },
"consume_stock_fifo":
{ Args: { "p_qty": number,"p_sku": string,"p_warehouse_id": number }; Returns: number
                           },
"create_stock_batch":
{ Args: { "p_cost_price"?: number,"p_document_id"?: string,"p_qty": number,"p_received_at"?: string,"p_sku": string,"p_supplier_id"?: number,"p_warehouse_id": number }; Returns: string
                           },
"credit_cod_to_partner":
{ Args: { "p_cod_amount": number,"p_customer_id": string,"p_np_fee_pct"?: number,"p_order_id"?: string }; Returns: Json
                           },
"customer_display_name":
{ Args: { "p_company": string,"p_legal_name": string,"p_name": string }; Returns: string
                           },
"ensure_marketplace_sync":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"expire_stock_reservations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"fn_recalc_avg_cost":
{ Args: { "p_sku": string,"p_warehouse_id": number }; Returns: number
                           },
"increment_promo_used":
{ Args: { "p_code": string }; Returns: undefined
                           },
"mark_absent_supplier_stock":
{ Args: { "p_prev_rows"?: number,"p_rows_in_file": number,"p_supplier_id": number,"p_sync_started": string }; Returns: number
                           },
"next_ar_correction_number":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"next_doc_number":
{ Args: { "p_type": string }; Returns: string
                           },
"open_period":
{ Args: { "p_by"?: string,"p_month": string }; Returns: string
                           },
"reconcile_orphan_stock":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"record_money_txn":
{ Args: { "p_amount": number,"p_business_date"?: string,"p_contract_id"?: string,"p_created_by"?: string,"p_credit_account": string,"p_credit_party": string,"p_currency"?: string,"p_debit_account": string,"p_debit_party": string,"p_description"?: string,"p_doc_id"?: string,"p_doc_type"?: string,"p_idempotency_key"?: string,"p_meta"?: Json,"p_order_id"?: string }; Returns: string
                           },
"record_money_txn_legs":
{ Args: { "p_amount": number,"p_business_date"?: string,"p_created_by"?: string,"p_credit_account": string,"p_credit_contract_id": string,"p_credit_order_id": string,"p_credit_party": string,"p_debit_account": string,"p_debit_contract_id": string,"p_debit_order_id": string,"p_debit_party": string,"p_description"?: string,"p_doc_id"?: string,"p_doc_type"?: string,"p_idempotency_key"?: string,"p_meta"?: Json }; Returns: string
                           },
"refund_partner_balance":
{ Args: { "p_amount": number,"p_customer_id": string,"p_description"?: string,"p_order_id"?: string }; Returns: Json
                           },
"reject_payout":
{ Args: { "p_admin_email": string,"p_payout_id": string }; Returns: Json
                           },
"release_order_reservations":
{ Args: { "p_order_id": string,"p_reason"?: string }; Returns: number
                           },
"reserve_order_items":
{ Args: { "p_items": Json,"p_order_id": string,"p_warehouse_id": number }; Returns: Json
                           } |
{ Args: { "p_expires_at"?: string,"p_items": Json,"p_order_id": string,"p_warehouse_id": number }; Returns: Json
                           },
"reset_accounting_test_data":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"search_prom_categories":
{ Args: { "lim"?: number,"q"?: string }; Returns: {
              "commission_ecom": number,"commission_more": number,"commission_single": number,"commission_turbo": number,"name": string,"path": string,"prom_category_id": number
            }[]
                           },
"set_marketplace_sync_interval":
{ Args: { "p_minutes": number }; Returns: string
                           },
"submit_payout_request":
{ Args: { "p_amount": number,"p_auth_user_id": string,"p_bank_details"?: string,"p_method": string }; Returns: Json
                           },
"sync_product_stock_from_suppliers":
{ Args: { "p_sku": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
