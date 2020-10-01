# Export
Service to export YourLoops data in selected formats, either csv, json or xls.

## 1.4.5 - 2020-09-29
### Engineering
PT-1529 Base export image on node:10-alpine

## 1.4.4 - 2020-09-07
### Changed
- PT-1496 Replace external gateway calls with direct service calls

## 1.4.3 - 2020-08-04
### Engineering
- PT-1454 Generate SOUP document

## 1.4.2 - 2020-02-11
### Fix 
- PT-1107 Numeric values with a value of 0 are exported as an empty string in csv

## 1.4.1 - 2019-11-28
### Fix 
- PT-827 Fix wrong parameter usage

## 1.4.0 - 2019-11-28
### Added 
- PT-823 Upgrade to Tidepool 1.4.0 to get food objects

## 1.3.2 - 2019-09-10
### Added
- Add CSV format to the list of suported export formats

### Engineering Use
- PT-420 Make it YourLoops compatible (build, CI, CD, docker)