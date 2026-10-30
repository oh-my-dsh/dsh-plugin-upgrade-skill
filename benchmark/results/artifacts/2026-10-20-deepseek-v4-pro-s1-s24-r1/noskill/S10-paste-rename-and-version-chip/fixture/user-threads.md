# Issue tracker excerpts — @org/dsh-attach-input, after v0.2.10 shipped

## Follow-up A — "pasted screenshots all have the same name" (user: kaylint)

> I paste screenshot after screenshot and every chip is called image.png (that's the name
> the browser gives clipboard files). Can you rename pasted files like chat apps do —
> paste_image.png, paste_image(2).png, paste_image(3).png…? Same for other pasted files
> (paste_file.pdf etc.). But keep the real names when I drag files in or use the picker —
> those are my actual files.

Maintainer note (me): today add() keeps item.path verbatim; my only duplicate check is
within a single selection batch (validateItems). Two pastes of two screenshots both carry
"image.png".

## Follow-up B — "your chip says latest v0.2.9 but I'm on v0.2.10 and you just released v0.2.11" (user: rho_9)

> Minutes after you announced v0.2.11 I hard-refreshed (I still had v0.2.10 installed) and
> the green chip told me "already the latest version v0.2.9". I almost closed the tab.
> A while later it changed its mind.

Maintainer note (me): the running bundle's hand-inlined PLUGIN_VERSION was 0.2.10; the
chip fetches the tag list from the GitHub API and renders the fetched tag in the green
"already latest" chip when it is <= the running version. See tags-api-response.txt for
what the API returned during that window.
