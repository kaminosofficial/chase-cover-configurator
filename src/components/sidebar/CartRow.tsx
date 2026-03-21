import { useEffect, useState } from 'react';
import { useConfigStore } from '../../store/configStore';

interface Props {
  onAddToCart: () => void;
  onBuyNow: () => void;
  isSubmitting?: boolean;
  submittingAction?: 'cart' | 'buy' | null;
  submittingStep?: string;
}

const MAX_QTY = 10;

function getCartLabel(step: string): string {
  if (step === 'cart:building') return 'Crafting your cover...';
  if (step === 'cart:adding')   return 'Adding to cart...';
  if (step === 'cart:syncing')  return 'Confirming price...';
  return 'Processing...';
}

function getBuyLabel(step: string): string {
  if (step === 'buy:building')    return 'Crafting your cover...';
  if (step === 'buy:adding')      return 'Preparing checkout...';
  if (step === 'buy:syncing')     return 'Confirming price...';
  if (step === 'buy:redirecting') return 'Off we go!';
  return 'Processing...';
}

export function CartRow({ onAddToCart, onBuyNow, isSubmitting = false, submittingAction = null, submittingStep = '' }: Props) {
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

  const cartBusy = isSubmitting && submittingAction === 'cart';
  const buyBusy  = isSubmitting && submittingAction === 'buy';

  const cartLabel = cartBusy ? getCartLabel(submittingStep) : 'Add to Cart';
  const buyLabel  = buyBusy  ? getBuyLabel(submittingStep)  : 'Buy Now';

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
          aria-busy={cartBusy}
          style={{ flex: 1 }}
        >
          <span key={cartLabel} className={cartBusy ? 'cart-btn-step' : undefined}>
            {cartLabel}
          </span>
        </button>

        <button
          className="buy-now-btn"
          onClick={onBuyNow}
          disabled={isSubmitting}
          aria-busy={buyBusy}
          style={{ flex: 1 }}
        >
          <span key={buyLabel} className={buyBusy ? 'cart-btn-step' : undefined}>
            {buyLabel}
          </span>
        </button>
      </div>

      {/* Thin progress bar — brand-colored, slides continuously while busy */}
      {isSubmitting && (
        <div className="cart-progress-track">
          <div className="cart-progress-fill" />
        </div>
      )}
    </>
  );
}
