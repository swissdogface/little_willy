echo off
rem shar2reg.bat
rem 190294im
cls
if "%1" == "" goto parerr
if "%2" == "" goto la0
if "%3" == "" goto parerr
:la0
echo *********************************************************************
echo *  LITTLE WILLY                                                     *
echo *  Kopieren aller gespeicherten SpielstÑnde der Shareware-Diskette  *
echo *  auf die Vollversions-Diskette.                                   *
echo *********************************************************************
echo.

:la1
echo    Bitte Shareware-Diskette einlegen
echo    in Laufwerk %1
echo.
pause
if exist %1lend.spr goto la1

if "%2" == "" goto la2
copy %1\*.sav %2%3 /v 
goto la3

:la2
copy %1\*.sav c:\lwdummy

:la3
echo    Bitte Vollversions-Diskette einlegen
echo    in Laufwerk %1
echo.
pause
if exist %1share.dat goto la3

if "%2" == "" goto la4
copy %2%3\*.sav %1 /v
goto la5

:la4
copy c:\lwdummy\*.sav %1 /v

:la5
if "%2" == "" goto la6
%1\deltemp %1 %2 %3
goto prgend

:la6
%1\deltemp %1
goto prgend

:parerr
echo Keine oder falsche Parameter angegeben !
echo Aufruf per s2r:
echo.
echo    s2r [Quell-Laufwerk] {[TemporÑr-Laufwerke] [TemporÑr-Verzeichnis]}
echo.
echo Falls kein TemporÑr-Laufwerk/Verzeichnis angegeben wird,
echo wird c:\lwdummy vorÅbergehend erstellt.
echo.

:prgend
rem EOF
