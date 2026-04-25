import { SignIn } from '@clerk/clerk-react';

export default function SignInRoute() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '40px 0' }}>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-in" />
    </div>
  );
}
