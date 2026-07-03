echo off
rem deltemp.bat
rem 240294im
cls
if "%1" == "" goto parerr
if "%2" == "" goto la0
if "%3" == "" goto parerr

:la0
if "%2" == "" goto la1
del %2%3\*.sav
del %2%3\*.bat
cd %2\
rd %2%3
goto la2

:la1
del c:\lwdummy\*.sav
del c:\lwdummy\*.bat
cd c:\
rd c:\lwdummy

:la2
echo ******************************
echo *  Alle SpielstÑnde kopiert  *
echo ******************************
echo.
echo    Auf Laufwerk %1
dir %1\*.sav /w
echo.
echo ******************************
echo *      LW zum starten        *
echo ******************************
echo.
%1
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
