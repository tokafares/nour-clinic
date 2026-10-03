import { Compass } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <EmptyState
        icon={Compass}
        title="We couldn't find that page"
        description="The link may be broken or the page may have moved."
        action={<ButtonLink to="/">Back to home</ButtonLink>}
      />
    </div>
  );
}
