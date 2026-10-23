import React from 'react';
import { IonSelect, IonSelectOption } from '@ionic/react';

export const SessionSelect: React.FC<{ sessions: string[]; value: string; onChange: (v: string) => void; all?: boolean; label?: string }> =
  ({ sessions, value, onChange, all, label = 'Academic session' }) => (
    <IonSelect fill="outline" label={label} labelPlacement="stacked" value={value} onIonChange={(e) => onChange(String(e.detail.value ?? ''))}>
      {all && <IonSelectOption value="">All sessions</IonSelectOption>}
      {sessions.map((s) => <IonSelectOption key={s} value={s}>{s}</IonSelectOption>)}
    </IonSelect>
  );

export const SemesterSelect: React.FC<{ value: string; onChange: (v: string) => void; all?: boolean; summer?: boolean }> =
  ({ value, onChange, all, summer }) => (
    <IonSelect fill="outline" label="Semester" labelPlacement="stacked" value={value} onIonChange={(e) => onChange(String(e.detail.value ?? ''))}>
      {all && <IonSelectOption value="">Both semesters</IonSelectOption>}
      <IonSelectOption value="FIRST">First</IonSelectOption>
      <IonSelectOption value="SECOND">Second</IonSelectOption>
      {summer && <IonSelectOption value="SUMMER">Summer</IonSelectOption>}
    </IonSelect>
  );
