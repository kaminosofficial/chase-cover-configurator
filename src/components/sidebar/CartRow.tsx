import { useEffect, useState } from 'react';
import { useConfigStore } from '../../store/configStore';

interface Props {
  onAddToCart: () => void;
  onBuyNow: () => void;
  isSubmitting?: boolean;
  submittingAction?: 'cart' | 'buy' | null;
}

const MAX_QTY = 10;

export function CartRow({ onAddToCart, onBuyNow, isSubmitting = false, submittingAction = null }: Props) {
  const quantity = useConfigStore(s => s.quantity);
  const set = useConfigStore(s => s.set);
  const [quantityText, setQuantityText] = useState(String(quantity));

  useEffect(() => {
    setQuantityText(String(quantity));
  }, [quantity]);

  function commitQuantity(raw: string) {
    const digitsOnly = raw.replace(/\D+/g, '');
    const parsed = parseInt(digitsOnly, 10);
    const next = Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_QTY, parsed)) : 1;
    set({ quantity: next });
    setQuantityText(String(next));
  }

  return (
    <>
      <div className="cart-row" style={{ display: 'flex', gap: '10px', alignItems: 'stretch', marginTop: '10px' }}>
        <div className="qty-field" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>QTY</label>
          <input
            type="number"
            min={1} max={MAX_QTY} step={1}
            inputMode="numeric"
            value={quantityText}
            onChange={e => {
              const nextText = e.target.value.replace(/[^\d]/g, '');
              setQuantityText(nextText);
            }}
            onFocus={e => e.currentTarget.select()}
            onBlur={e => commitQuantity(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                commitQuantity((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={{ width: '52px' }}
          />
        </div>
        <button
          className="add-to-cart"
          onClick={onAddToCart}
          disabled={isSubmitting}
          aria-busy={isSubmitting && submittingAction === 'cart'}
          style={{ flex: 1 }}
        >
          {isSubmitting && submittingAction === 'cart' ? (
            <span className="add-to-cart-content">
              <span className="add-to-cart-spinner" aria-hidden="true" />
              Adding...
            </span>
          ) : (
            'Add to Cart'
          )}
        </button>
        <button
          className="buy-now-btn"
          onClick={onBuyNow}
          disabled={isSubmitting}
          aria-busy={isSubmitting && submittingAction === 'buy'}
          style={{ flex: 1 }}
        >
          {isSubmitting && submittingAction === 'buy' ? (
            <span className="add-to-cart-content">
              <span className="add-to-cart-spinner" aria-hidden="true" />
              Processing...
            </span>
          ) : (
            'Buy Now'
          )}
        </button>
      </div>
    </>
  );
}
