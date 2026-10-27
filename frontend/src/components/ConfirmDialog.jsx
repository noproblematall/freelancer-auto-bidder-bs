import { createContext, useContext, useState, useCallback } from 'react'

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: null,
    onCancel: null,
    variant: 'default', // 'default' | 'danger'
  })

  const confirm = useCallback(
    ({ title = 'Confirm', message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'default' }) => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          title,
          message,
          confirmText,
          cancelText,
          variant,
          onConfirm: () => {
            setState((prev) => ({ ...prev, isOpen: false }))
            resolve(true)
          },
          onCancel: () => {
            setState((prev) => ({ ...prev, isOpen: false }))
            resolve(false)
          },
        })
      })
    },
    []
  )

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={state.onCancel}
          />

          {/* Dialog */}
          <div className="relative bg-white dark:bg-navy-900 rounded-xl shadow-2xl border border-slate-200 dark:border-white/8 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Title */}
            <h3 className="text-lg font-semibold text-navy-950 dark:text-white mb-2">
              {state.title}
            </h3>

            {/* Message */}
            <p className="text-sm text-slate-700 dark:text-slate-200 mb-6">
              {state.message}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={state.onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-800 border border-slate-300 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
              >
                {state.cancelText}
              </button>
              <button
                onClick={state.onConfirm}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  state.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-navy-900 dark:bg-emerald-400 hover:bg-navy-800 dark:hover:bg-emerald-500 text-white dark:text-navy-950'
                }`}
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return context.confirm
}
