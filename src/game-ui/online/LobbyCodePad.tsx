import { OnlineIcon } from './OnlineIcon';
import './lobbyCodePad.css';

export function LobbyCodePad({
  title,
  description,
  value,
  onChange,
  onConfirm,
  onClose,
  pending = false,
  error = '',
}: {
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  error?: string;
}) {
  const pushDigit = (digit: string) => {
    if (pending || value.length >= 4) return;
    onChange(`${value}${digit}`);
  };
  const erase = () => {
    if (pending) return;
    onChange(value.slice(0, -1));
  };

  return <div
    className="lobby-code-pad-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="lobby-code-pad-title"
    onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) onClose(); }}
  >
    <section className="lobby-code-pad">
      <button type="button" className="lobby-code-pad__close" aria-label="Закрыть" disabled={pending} onClick={onClose}><OnlineIcon name="close"/></button>
      <h2 id="lobby-code-pad-title">{title}</h2>
      <p>{description}</p>
      <input
        autoFocus
        className="lobby-code-pad__field"
        aria-label="Код лобби из четырёх цифр"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={4}
        placeholder="••••"
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={(event) => { if (event.key === 'Enter' && value.length === 4) onConfirm(); }}
      />
      {error && <div className="lobby-code-pad__error">{error}</div>}
      <div className="lobby-code-pad__keys" aria-label="Цифровая клавиатура">
        {[1,2,3,4,5,6,7,8,9].map((digit) => <button type="button" key={digit} disabled={pending} onClick={() => pushDigit(String(digit))}>{digit}</button>)}
        <button type="button" className="is-backspace" aria-label="Удалить цифру" disabled={pending || value.length === 0} onClick={erase}>⌫</button>
        <button type="button" disabled={pending} onClick={() => pushDigit('0')}>0</button>
        <button type="button" className="is-confirm" aria-label="Подтвердить код" disabled={pending || value.length !== 4} onClick={onConfirm}><OnlineIcon name="check"/></button>
      </div>
      {pending && <small className="lobby-code-pad__pending">Подключаем…</small>}
    </section>
  </div>;
}
