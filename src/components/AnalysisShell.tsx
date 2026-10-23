import React from 'react';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { printOutline, refreshOutline } from 'ionicons/icons';
import { InstitutionLogo, PrintHeader } from './InstitutionLogo';
import { DeptBanner } from './DeptBanner';
import { useAuth } from '../lib/auth';

/** Common frame of the analysis pages: toolbar with Print, printable header with the university logo. */
export const AnalysisShell: React.FC<{
  title: string; subtitle?: string; back?: string; loading?: boolean; error?: string; onReload?: () => void; children: React.ReactNode;
}> = ({ title, subtitle, back = '/analysis', loading, error, onReload, children }) => {
  const { institution } = useAuth();
  return (
    <IonPage>
      <IonHeader>
        <DeptBanner />
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={back} /></IonButtons>
          <IonTitle>{title}</IonTitle>
          <IonButtons slot="end">
            <InstitutionLogo code={institution?.code} />
            {onReload && <IonButton onClick={onReload}><IonIcon slot="icon-only" icon={refreshOutline} /></IonButton>}
            <IonButton onClick={() => window.print()}><IonIcon slot="start" icon={printOutline} />Print</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="editor">
          <PrintHeader title={title} subtitle={subtitle} />
          {error && <IonText color="danger"><p className="pad">{error}</p></IonText>}
          {loading ? <div className="center-screen"><IonSpinner /></div> : children}
        </div>
      </IonContent>
    </IonPage>
  );
};
