# Module entry points

The canonical boundaries remain in the delivery skill and requirements §17.
Runtime public APIs use src/<module>/index.ts; only same-module code imports
private files. main.ts composes app/index.ts and the public stylesheet.

M01 app; M02 globe; M03 camera; M04 vision and workers; M05 gesture;
M06 interaction; M07 geo; M08 ui; M09 config; M10 diagnostics;
M11 qa (tests and scripts execute quality tools); M12 agent implements a
default-off tool gateway and external adapter contracts. shared contains pure common contracts.

M01–M12 expose implemented public contracts. M12 contract/loopback tests
do not establish a completed real external service integration.
ESLint checks imports, re-exports and dynamic imports. The Gesture/Worker checks
also reject DOM globals. Boundary fixtures prove the known forbidden edges;
static checks supplement review and do not prove all possible dynamic behavior.
