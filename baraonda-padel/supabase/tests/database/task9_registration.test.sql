begin;
select plan(12);

select has_table('public', 'profiles', 'profiles table exists');
select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');
select has_column('public', 'profiles', 'accepted_terms_at', 'terms acceptance timestamp is stored');
select has_column('public', 'profiles', 'marketing_consent', 'marketing consent is separate');
select has_column('public', 'profiles', 'terms_version', 'terms version is stored');
select has_column('public', 'profiles', 'privacy_version', 'privacy version is stored');
select hasnt_column('public', 'profiles', 'password', 'profiles never store passwords');
select has_trigger('auth', 'users', 'on_auth_user_created', 'new auth users create profiles');
select policies_are('public', 'profiles', array['Users can read own profile', 'Users can update own profile'], 'profiles have only owner policies');
select policies_are('public', 'tournaments', array['Owners can create tournaments', 'Owners can delete tournaments', 'Owners can read tournaments', 'Owners can update tournaments'], 'tournaments are owner scoped');
select function_returns('public', 'ensure_own_profile', array[]::text[], 'void', 'profile repair function exists');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id', 'profile deletion follows auth user');

select * from finish();
rollback;
