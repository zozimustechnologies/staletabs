# Edge Add-ons Policy Stress Test Checklist (57 Items)

Status legend: PASS = addressed in code/docs, REVIEW = manual verification needed before submission.

1. PASS - Manifest V3 format is used.
2. PASS - Extension has declared icon assets.
3. PASS - Permissions are explicitly listed.
4. PASS - No hidden remote code loaders in UI scripts.
5. PASS - No eval usage in extension scripts.
6. PASS - Local-only data storage model documented.
7. PASS - No credential harvesting behavior.
8. PASS - No deceptive install prompts in extension UI.
9. PASS - No malware or obfuscated payload behavior.
10. PASS - No cryptocurrency mining behavior.
11. PASS - No background network telemetry pipeline configured.
12. PASS - No browser hijacking behavior.
13. PASS - No unauthorized redirects.
14. PASS - No forced ads or injected affiliate links.
15. PASS - No auto-click or bot behavior.
16. PASS - No data sale claims or collection flows.
17. PASS - No permission escalation runtime prompts.
18. PASS - No remote command-and-control endpoint.
19. PASS - No hidden executable downloads.
20. PASS - No impersonation of Microsoft UI.
21. PASS - No misleading branding in extension UI.
22. PASS - Product purpose clearly disclosed in README.
23. PASS - Store description documents privacy stance.
24. PASS - Extension actions map to stated feature set.
25. PASS - Notification behavior is tied to user benefit.
26. PASS - Undo provided for destructive bulk close action.
27. PASS - User-configurable thresholds and controls included.
28. PASS - Reset controls for local stats available.
29. PASS - Report data sourced from local extension storage.
30. PASS - No external script imports in extension pages.
31. PASS - No unsafe inline event handlers in extension pages.
32. PASS - Runtime checks prevent context menu startup failures.
33. PASS - Popup actions are explicit and user initiated.
34. PASS - Stale definition is documented and configurable.
35. PASS - No dark-pattern checkout/payment flows in extension.
36. PASS - Donate link is transparent and external.
37. PASS - External links open in new tab on project site.
38. PASS - GitHub Pages uses local image references.
39. PASS - Store assets are provided as PNG files.
40. PASS - Required asset dimensions are generated.
41. REVIEW - Validate policy wording against current Edge policy revision.
42. REVIEW - Verify all permissions are strictly minimal for release build.
43. REVIEW - Confirm no unsupported APIs in target Edge version.
44. REVIEW - Confirm all notification strings align with policy wording.
45. REVIEW - Validate listing metadata in Partner Center submission form.
46. REVIEW - Verify localized copy, if added, matches behavior.
47. REVIEW - Confirm no restricted content categories are triggered.
48. REVIEW - Confirm age-rating metadata in Partner Center.
49. REVIEW - Confirm support contact fields in listing profile.
50. REVIEW - Confirm privacy policy URL requirement for your category.
51. REVIEW - Run manual install/update/uninstall tests in Edge stable.
52. REVIEW - Run incognito behavior test if enabled in listing.
53. REVIEW - Validate right-click context behavior across OS versions.
54. REVIEW - Confirm screenshot assets match shipped UX.
55. REVIEW - Validate short description length in listing editor.
56. REVIEW - Final schema validation in Partner Center package upload.
57. REVIEW - Final legal review for trademark/copyright statements.

## Notes on schema error

If Partner Center reports "JSON does not match all schemas of allOf" with invalid schema indexes, common fixes are:

- Remove unsupported or experimental manifest properties.
- Re-validate icon dimensions and manifest icon paths.
- Keep permission list minimal and supported.
- Repackage extension from clean project root with updated manifest.
