"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"
import { Button } from "./ui/button"
import { 
  User, Mail, Phone, MapPin, Calendar, AlertCircle, 
  Loader2, X, Building, FileText, DollarSign
} from "lucide-react"

interface CRMCustomerPanelProps {
  customerEmail: string
  crmMessageId?: number
  clientId?: number
  onClose?: () => void
}

export default function CRMCustomerPanel({ 
  customerEmail, 
  crmMessageId,
  clientId,
  onClose 
}: CRMCustomerPanelProps) {
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Extract email from "Name <email@example.com>" format
  const extractedEmail = (() => {
    if (!customerEmail) return ''
    const match = customerEmail.match(/<(.+?)>/)
    return match ? match[1] : customerEmail
  })()

  useEffect(() => {
    if (clientId || extractedEmail) {
      fetchCustomerData()
    }
  }, [clientId, extractedEmail])

  const fetchCustomerData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Build query params
      const params = new URLSearchParams()
      if (clientId) params.append('clientId', clientId.toString())
      if (extractedEmail) params.append('email', extractedEmail)

      const response = await fetch(`/api/crm/customer?${params}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Customer not found in CRM')
          return
        }
        throw new Error('Failed to fetch customer data')
      }

      const data = await response.json()
      setCustomer(data.customer)
    } catch (err) {
      console.error('Error fetching CRM customer data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load customer data')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '£0.00'
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="flex flex-col h-full w-full bg-card border-l border-border/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 bg-card/50 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Customer Info</h2>
          </div>
          {onClose && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 p-0 transition-all duration-300 ease-out hover:scale-110 hover:bg-muted hover:shadow-sm"
              title="Close Customer Info"
            >
              <X className="w-4 h-4 transition-transform duration-300 hover:rotate-90" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive/50" />
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCustomerData}
              className="mt-4"
            >
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !customer ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p>No customer data available</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Customer Header Card */}
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {customer.Firstname || customer.LastName ? (
                        `${customer.Firstname || ''} ${customer.LastName || ''}`.trim()
                      ) : (
                        'Customer'
                      )}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">
                      Client ID: <span className="font-mono text-primary">{customer.id}</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Contact Information */}
                <div className="space-y-2">
                  {customer.Email && (
                    <div className="flex items-start gap-3">
                      <Mail className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground mb-0.5">Email</div>
                        <span className="break-all text-foreground font-medium">{customer.Email}</span>
                      </div>
                    </div>
                  )}
                  
                  {customer.Phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Phone</div>
                        <span className="text-foreground font-medium">{customer.Phone}</span>
                      </div>
                    </div>
                  )}

                  {customer.Mobile && customer.Mobile !== customer.Phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Mobile</div>
                        <span className="text-foreground font-medium">{customer.Mobile}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Address Section */}
            {(customer.Address1 || customer.Address2 || customer.Town || customer.Postcode) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {customer.Address1 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Street Address</div>
                      <div className="font-medium text-foreground">{customer.Address1}</div>
                    </div>
                  )}
                  {customer.Address2 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Address Line 2</div>
                      <div className="font-medium text-foreground">{customer.Address2}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {customer.Town && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">Town/City</div>
                        <div className="font-medium text-foreground">{customer.Town}</div>
                      </div>
                    )}
                    {customer.County && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-0.5">County</div>
                        <div className="font-medium text-foreground">{customer.County}</div>
                      </div>
                    )}
                  </div>
                  {customer.Postcode && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Postcode</div>
                      <div className="font-mono font-semibold text-base text-primary">{customer.Postcode}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Personal Details */}
            {(customer.DateofBirth || customer.Occupation || customer.MaritalStatus) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Personal Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {customer.DateofBirth && (
                    <div className="flex items-center justify-between pb-2 border-b border-border/50">
                      <span className="text-muted-foreground">Date of Birth</span>
                      <span className="font-medium">{formatDate(customer.DateofBirth)}</span>
                    </div>
                  )}

                  {customer.Occupation && (
                    <div className="flex items-center justify-between pb-2 border-b border-border/50">
                      <span className="text-muted-foreground">Occupation</span>
                      <span className="font-medium">{customer.Occupation}</span>
                    </div>
                  )}

                  {customer.MaritalStatus && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Marital Status</span>
                      <span className="font-medium capitalize">{customer.MaritalStatus}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* IVA/Financial Information */}
            {(customer.iva_signing_date || customer.unsecured_debt || customer.monthly_payment) && (
              <Card className="border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Financial Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {customer.iva_signing_date && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">IVA Signing Date</div>
                      <div className="font-medium text-foreground">{formatDate(customer.iva_signing_date)}</div>
                    </div>
                  )}

                  {customer.iva_completion_date && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">IVA Completion Date</div>
                      <div className="font-medium text-foreground">{formatDate(customer.iva_completion_date)}</div>
                    </div>
                  )}
                  
                  {customer.unsecured_debt && (
                    <div className="bg-white/50 dark:bg-black/20 rounded p-2.5">
                      <div className="text-xs text-muted-foreground mb-0.5">Total Unsecured Debt</div>
                      <div className="font-semibold text-lg text-amber-700 dark:text-amber-400">
                        {formatCurrency(customer.unsecured_debt)}
                      </div>
                    </div>
                  )}

                  {customer.monthly_payment && (
                    <div className="bg-white/50 dark:bg-black/20 rounded p-2.5">
                      <div className="text-xs text-muted-foreground mb-0.5">Monthly Payment</div>
                      <div className="font-semibold text-lg text-green-700 dark:text-green-400">
                        {formatCurrency(customer.monthly_payment)}
                      </div>
                    </div>
                  )}

                  {customer.arrears_balance && customer.arrears_balance > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2.5">
                      <div className="text-xs text-red-700 dark:text-red-400 mb-0.5">Arrears Balance</div>
                      <div className="font-semibold text-lg text-red-800 dark:text-red-300">
                        {formatCurrency(customer.arrears_balance)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="pt-2 space-y-2 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(customer.Email || extractedEmail)
                  // You can add toast notification here if needed
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Copy Email
              </Button>

              {customer.Phone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    window.location.href = `tel:${customer.Phone}`
                  }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Call {customer.Phone}
                </Button>
              )}

              {customer.Mobile && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    window.location.href = `sms:${customer.Mobile}`
                  }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  SMS {customer.Mobile}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
