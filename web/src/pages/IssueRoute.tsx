import { useNavigate } from '@tanstack/react-router';
import { IssueDrawer } from '../components/IssueDrawer';
import { issueRoute, projectRoute } from '../router';

export function IssueRoute() {
  const { projectId, issueId } = issueRoute.useParams();
  const navigate = useNavigate();

  const close = (): void => {
    void navigate({
      to: projectRoute.fullPath,
      params: { projectId },
      search: (prev) => prev,
    });
  };

  return (
    <IssueDrawer projectId={projectId} issueId={issueId} open onClose={close} />
  );
}
