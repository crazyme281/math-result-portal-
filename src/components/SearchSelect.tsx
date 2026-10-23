import React, { useRef, useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonSearchbar,
  IonTitle, IonToolbar,
} from '@ionic/react';
import { chevronDown } from 'ionicons/icons';

export interface Option { value: string; label: string }

interface Props {
  label: string;
  placeholder: string;
  value: string;
  options: Option[];
  /** Always shown at the bottom of the list, even while searching (e.g. "Other..."). */
  extra?: Option;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const SearchSelect: React.FC<Props> = ({ label, placeholder, value, options, extra, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const bar = useRef<HTMLIonSearchbarElement>(null);

  const selected = options.find((o) => o.value === value);
  const term = q.trim().toLowerCase();
  const shown = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;

  const close = () => { setOpen(false); setQ(''); };
  const pick = (v: string) => { close(); onChange(v); };

  return (
    <>
      <div className={`ss-field ${disabled ? 'disabled' : ''}`}>
        <span className="ss-label">{label}</span>
        <button type="button" className="ss-btn" disabled={disabled} onClick={() => setOpen(true)}>
          <span className={selected ? '' : 'ss-ph'}>{selected ? selected.label : placeholder}</span>
          <IonIcon icon={chevronDown} />
        </button>
      </div>

      <IonModal isOpen={open} onDidPresent={() => bar.current?.setFocus()} onDidDismiss={close}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>{label}</IonTitle>
            <IonButtons slot="end"><IonButton onClick={close}>Close</IonButton></IonButtons>
          </IonToolbar>
          <IonToolbar>
            <IonSearchbar ref={bar} placeholder={`Search ${label.toLowerCase()}`} value={q}
              onIonInput={(e) => setQ(String(e.detail.value ?? ''))} />
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonList>
            {shown.map((o) => (
              <IonItem key={o.value} button detail={false} onClick={() => pick(o.value)}
                color={o.value === value ? 'light' : undefined}>
                <IonLabel className="ion-text-wrap">{o.label}</IonLabel>
              </IonItem>
            ))}
            {!shown.length && <IonItem><IonLabel className="muted">No match for "{q}"</IonLabel></IonItem>}
            {extra && (
              <IonItem button detail={false} onClick={() => pick(extra.value)}>
                <IonLabel color="primary">{extra.label}</IonLabel>
              </IonItem>
            )}
          </IonList>
        </IonContent>
      </IonModal>
    </>
  );
};

export default SearchSelect;
