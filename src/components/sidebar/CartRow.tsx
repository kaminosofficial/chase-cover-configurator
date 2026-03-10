import { useConfigStore } from '../../store/configStore';

interface Props { onAddToCart: () => void; }

const MAX_QTY = 10;

export function CartRow({ onAddToCart }: Props) {
  const quantity = useConfigStore(s => s.quantity);
  const set = useConfigStore(s => s.set);

  return (
    <>
      <div className="cart-row" style={{ display: 'flex', gap: '10px', alignItems: 'stretch', marginTop: '10px' }}>
        <div className="qty-field" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>QTY</label>
          <input
            type="number"
            min={1} max={MAX_QTY} step={1}
            value={quantity}
            onChange={e => {
              const v = parseInt(e.target.value) || 1;
              set({ quantity: Math.max(1, Math.min(MAX_QTY, v)) });
            }}
            onBlur={() => {
              if (quantity > MAX_QTY) set({ quantity: MAX_QTY });
              if (quantity < 1) set({ quantity: 1 });
            }}
            style={{ width: '52px' }}
          />
        </div>
        <button className="add-to-cart" onClick={onAddToCart} style={{ flex: 1 }}>
          Add to Cart
        </button>
      </div>
    </>
  );
}
