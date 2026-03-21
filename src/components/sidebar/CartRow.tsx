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

/* Inline SVG for the Shop logo (white, from Shopify brand assets) */
function ShopLogo() {
  return (
    <svg className="shop-logo" viewBox="0 0 341 81" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Shop">
      <path d="M227.564 0C220.233 0 214.554 4.97701 211.905 12.4569L197.392 55.3644H197.219L183.136 12.4569C180.488 4.97701 174.808 0 167.478 0C158.668 0 152.294 7.0936 152.294 16.1608V64.4312C152.294 73.4984 158.668 80.592 167.478 80.592C176.287 80.592 182.662 73.4984 182.662 64.4312V39.8531H182.835L192.497 64.4312C194.799 70.5732 199.174 74.1244 204.853 74.1244H210.36C216.039 74.1244 220.414 70.5732 222.716 64.4312L232.378 39.8531H232.551V64.4312C232.551 73.4984 238.925 80.592 247.735 80.592C256.544 80.592 262.919 73.4984 262.919 64.4312V16.1608C262.919 7.0936 256.544 0 247.735 0H227.564Z" fill="currentColor"/>
      <path d="M36.8286 0C22.3152 0 10.8424 5.32341 10.8424 18.6319C10.8424 35.1206 35.3484 36.6014 35.3484 44.6911C35.3484 47.3035 33.0464 49.5712 28.4424 49.5712C22.0564 49.5712 14.3797 44.1693 8.51366 39.6783C3.5614 35.9015 0 37.7328 0 43.5272V62.5148C0 66.2418 1.72574 68.6836 5.40659 70.5148C10.6116 73.1271 18.6349 76.3252 29.0549 76.3252C46.7316 76.3252 57.4989 67.0842 57.4989 53.7735C57.4989 36.2488 32.9929 34.7702 32.9929 27.3723C32.9929 24.7599 35.0861 22.6634 39.0356 22.6634C44.2365 22.6634 50.9674 26.0663 56.3153 30.2103C60.8622 33.6394 64.0786 31.981 64.0786 26.3604V10.7457C64.0786 7.01874 62.3529 4.57695 58.672 2.74575C54.0767 0.480804 46.2264 0 36.8286 0Z" fill="currentColor"/>
      <path d="M99.5007 0C79.1519 0 66.3729 17.3245 66.3729 40.2901C66.3729 63.2557 79.1519 80.5803 99.5007 80.5803C107.524 80.5803 114.067 77.447 118.268 73.8227V64.4312C118.268 73.4984 124.642 80.592 133.452 80.592C142.261 80.592 148.636 73.4984 148.636 64.4312V16.1608C148.636 7.0936 142.261 0 133.452 0C124.642 0 118.268 7.0936 118.268 16.1608V6.75787C114.067 3.13358 107.524 0 99.5007 0ZM104.66 54.0545C98.1003 54.0545 93.4963 47.6516 93.4963 40.2901C93.4963 32.9286 98.1003 26.5257 104.66 26.5257C111.219 26.5257 115.823 32.9286 115.823 40.2901C115.823 47.6516 111.219 54.0545 104.66 54.0545Z" fill="currentColor"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M275.106 0C265.775 0 259.4 7.0936 259.4 16.1608V64.4312C259.4 73.4984 265.775 80.592 275.106 80.592C284.437 80.592 290.812 73.4984 290.812 64.4312V62.4285C294.84 67.1375 301.383 70.2708 309.233 70.2708C327.605 70.2708 340.384 55.5752 340.384 35.1352C340.384 14.6952 327.605 0 309.233 0C301.383 0 294.84 3.13314 290.812 7.84393V16.1608C290.812 7.0936 284.437 0 275.106 0ZM304.073 26.5257C310.633 26.5257 315.237 32.2449 315.237 35.1352C315.237 38.0255 310.633 43.7448 304.073 43.7448C297.514 43.7448 292.91 38.0255 292.91 35.1352C292.91 32.2449 297.514 26.5257 304.073 26.5257Z" fill="currentColor"/>
    </svg>
  );
}

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
  const buyLabelText = buyBusy ? getBuyLabel(submittingStep) : null;

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
          {buyLabelText ? (
            <span key={buyLabelText} className="cart-btn-step">
              {buyLabelText}
            </span>
          ) : (
            <>
              <span>Buy with</span>
              <ShopLogo />
            </>
          )}
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
