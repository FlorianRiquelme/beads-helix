import { useNavigate } from '@tanstack/react-router';
import { Board } from '../components/Board';
import type { PriorityFilter } from '../components/FilterToolbar';
import { projectRoute } from '../router';

export function ProjectPage() {
  const { projectId } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const navigate = useNavigate({ from: projectRoute.fullPath });

  const setPriority = (next: PriorityFilter): void => {
    void navigate({
      search: (prev) => ({ ...prev, priority: next === 'all' ? undefined : next }),
      replace: true,
    });
  };
  const setQuery = (next: string): void => {
    void navigate({
      search: (prev) => ({ ...prev, q: next === '' ? undefined : next }),
      replace: true,
    });
  };

  const priority: PriorityFilter =
    search.priority === undefined ? 'all' : (search.priority as PriorityFilter);

  return (
    <Board
      projectId={projectId}
      priority={priority}
      query={search.q ?? ''}
      onPriorityChange={setPriority}
      onQueryChange={setQuery}
    />
  );
}
