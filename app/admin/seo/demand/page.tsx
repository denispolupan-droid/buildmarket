import DemandClient from './DemandClient';
import HiddenDemand from './HiddenDemand';
import HelpBox from '../HelpBox';
import { HELP_DEMAND } from '../help-content';

export const dynamic = 'force-dynamic';

export default function SeoDemandPage() {
  return (
    <>
      <HelpBox content={HELP_DEMAND} />
      <DemandClient />
      <HiddenDemand />
    </>
  );
}
