# Projects public-build reader

This patch targets website2025 `fa2f1324d7fd8171ca641fef0e493ae6d032ffd8` and changes Projects only.
It grants no publication, merge, deployment, schedule or account-setting authority.

The existing approved personal and organization README sections also accept `## Public Builds`.
An ordinary authored GitHub repository link in that section can produce one Projects card after
matching canonical public repository metadata is read. Keys compare without case sensitivity.
Earlier allowed sections keep label/order precedence. The parser does not read project profiles,
private files, plans, source code or arbitrary linked URLs. Source metadata resolves each index's
actual default branch before reading its README. Optional root `release-note.json` still uses `HEAD`;
an absent, invalid or failed release read adds no version.

The actual linked card article carries `data-project-repository="owner/repository"` in lower case.
A navigation link, pending diagnostic or unlinked authored story does not carry this marker.
Private, absent, mismatched and unknown repository identities cannot regain public GitHub links
through baseline or editorial paths. Authored case-study text remains available without its
withheld repository link. Release files are read only for admitted repository links.

If either index fails, both use the committed snapshot and the page says so. Successfully read
empty allowed sections are a valid empty index; they do not restore withdrawn managed rows.
A document with no allowed headings is a failed index. This patch does not add automatic
unenrollment: source-profile withdrawal requires a separately reviewed removal of the Public Builds
row. Any retained editorial or earlier-index representation must be reviewed separately.

The normal cache requests 86,400-second revalidation. It can serve a stale response while refreshing,
and retain earlier data on failure. Removal has no guaranteed deadline and there is no purge endpoint.
After later explicit activation approval, verify the served card's marker/title/link, source and README
heads, observation time and any cache interventions. README registration alone does not establish
that the deployed website has this reader. The local fixtures use a two-second cache window and must
never be configured on a public deployment.

Verification uses installed dependencies, an isolated source copy and loopback fixtures. It does not
execute selected-project code, write GitHub, install, commit or deploy. Font CSS is mocked only for the
offline build; the source patch preserves the existing remote font imports. Local route HTML and cache
checks establish compatibility with this base, not live publication or visual acceptance.
