echo off
rem s2r.bat
rem 180294im
rem shar2reg inst-prg.

cls
if "%1" == "" goto parerr
if "%2" == "" goto la0
if "%3" == "" goto parerr
:la0
echo ********************************************
echo *             LITTLE WILLY                 *
echo *  Kopieren der gespeicherten SpielstÑnde  *
echo *  von: Shareware-Version                  *
echo *  zu : Registrierte Vollversion           *
echo ********************************************
echo.
echo    Quelle              : Laufwerk %1
echo    Ziel                : Laufwerk %1

if "%2" == "" goto la1
echo    TemporÑr-Laufwerk   : %2
echo    TemporÑr-Verzeichnis: %3
goto la2

:la1
echo    TemporÑr-Laufwerk   : c:
echo    TemporÑr-Verzeichnis: \lwdummy

:la2
echo.                                             
echo **************************************************      
echo *            Falls Angabe nicht O.K.             *      
echo *         Ctrl - C zum Abrechen drÅcken          *      
echo **************************************************      
echo. 
pause

if "%2" == "" goto la3
md %2%3
copy %1\shar2reg.bat %2%3 /v
%2
cd %3
shar2reg.bat %1 %2 %3
goto prgend

:la3
md c:\lwdummy
copy %1\shar2reg.bat c:\lwdummy /v
c:
cd \lwdummy
shar2reg.bat %1
goto prgend

:parerr
echo Keine oder falsche Parameter angegeben !
echo Aufruf:
echo.
echo    s2r [Quell-Laufwerk] {[TemporÑr-Laufwerke] [TemporÑr-Verzeichnis]}
echo.
echo Falls kein TemporÑr-Laufwerk/Verzeichnis angegeben wird,
echo wird c:\lwdummy vorÅbergehend erstellt.
echo.

:prgend
rem EOF
