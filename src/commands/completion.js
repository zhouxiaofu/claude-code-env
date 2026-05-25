'use strict';

const config = require('../config');
const log = require('../util/log');
const { t } = require('../i18n');

// `cce completion <shell>`     — print a completion script to stdout.
// `cce completion --envs`      — internal: emit newline-separated env names for completion to consume.
function run(args) {
  if (args[0] === '--envs' || args[0] === '__envs__') {
    let cfg;
    try {
      cfg = config.load();
    } catch {
      return 0;
    }
    process.stdout.write(config.listEnvNames(cfg).join('\n') + '\n');
    return 0;
  }

  const shell = (args[0] || '').toLowerCase();
  switch (shell) {
    case 'bash':
      process.stdout.write(bashScript());
      return 0;
    case 'zsh':
      process.stdout.write(zshScript());
      return 0;
    case 'powershell':
    case 'pwsh':
      process.stdout.write(powershellScript());
      return 0;
    case 'fish':
      process.stdout.write(fishScript());
      return 0;
    default:
      log.error(t('completion.usage'));
      log.plain('');
      log.plain('  bash:        cce completion bash       >> ~/.bashrc        # then: source ~/.bashrc');
      log.plain('  zsh:         cce completion zsh        >> ~/.zshrc         # then: source ~/.zshrc');
      log.plain('  fish:        cce completion fish > ~/.config/fish/completions/cce.fish');
      log.plain('  powershell:  cce completion powershell >> $PROFILE         # then: . $PROFILE');
      return 1;
  }
}

const SUB = ['list', 'ls', 'show', 'edit', 'use', 'current', 'lang', 'pick', 'completion', 'help'];
const TOP_FLAGS = ['-e', '--env', '-a', '-A', '-m', '--merge-mode', '-h', '--help', '-v', '--version'];
const MERGE_MODES = ['override', 'cce', 'claude'];
const LANGS = ['en', 'zh-CN', 'auto'];

function bashScript() {
  return `# cce bash completion — install with: cce completion bash >> ~/.bashrc
_cce_completion() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  # Complete env names after -e / --env / 'use' / 'show'
  case "$prev" in
    -e|--env|use|show)
      local envs
      envs="$(cce completion --envs 2>/dev/null)"
      COMPREPLY=( $(compgen -W "$envs" -- "$cur") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh powershell fish" -- "$cur") )
      return 0
      ;;
    -m|--merge-mode)
      COMPREPLY=( $(compgen -W "${MERGE_MODES.join(' ')}" -- "$cur") )
      return 0
      ;;
    lang)
      COMPREPLY=( $(compgen -W "${LANGS.join(' ')}" -- "$cur") )
      return 0
      ;;
  esac

  # First positional: subcommand or top-level flag
  if [[ $COMP_CWORD -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${SUB.join(' ')} ${TOP_FLAGS.join(' ')}" -- "$cur") )
    return 0
  fi

  # Otherwise, suggest top-level flags (claude args fall through to claude itself)
  COMPREPLY=( $(compgen -W "${TOP_FLAGS.join(' ')}" -- "$cur") )
}
complete -F _cce_completion cce
`;
}

function zshScript() {
  return `# cce zsh completion — install with: cce completion zsh >> ~/.zshrc
_cce() {
  local -a subcommands flags
  subcommands=(${SUB.map((s) => `'${s}'`).join(' ')})
  flags=(${TOP_FLAGS.map((f) => `'${f}'`).join(' ')})

  local prev="\${words[CURRENT-1]}"
  case "$prev" in
    -e|--env|use|show)
      local envs
      envs=($(cce completion --envs 2>/dev/null))
      compadd -- $envs
      return
      ;;
    completion)
      compadd -- bash zsh powershell fish
      return
      ;;
    -m|--merge-mode)
      compadd -- ${MERGE_MODES.join(' ')}
      return
      ;;
    lang)
      compadd -- ${LANGS.join(' ')}
      return
      ;;
  esac

  if (( CURRENT == 2 )); then
    compadd -- $subcommands $flags
    return
  fi
  compadd -- $flags
}
compdef _cce cce
`;
}

function fishScript() {
  return `# cce fish completion — install with: cce completion fish > ~/.config/fish/completions/cce.fish
function __cce_envs
  cce completion --envs 2>/dev/null
end

# Subcommands (only when no subcommand has been typed yet)
complete -c cce -n '__fish_use_subcommand' -a 'list ls show edit use current lang pick completion help'
complete -c cce -n '__fish_use_subcommand' -s e -l env -a '(__cce_envs)' -d 'Use an env'
complete -c cce -n '__fish_use_subcommand' -s a -d 'Merge claude args'
complete -c cce -n '__fish_use_subcommand' -s A -d 'Override claude args'
complete -c cce -n '__fish_use_subcommand' -s h -l help
complete -c cce -n '__fish_use_subcommand' -s v -l version

# Env name argument for subcommands that take one
for cmd in use show
  complete -c cce -n "__fish_seen_subcommand_from $cmd" -a '(__cce_envs)'
end
complete -c cce -n '__fish_seen_subcommand_from completion' -a 'bash zsh powershell fish'
complete -c cce -n '__fish_seen_subcommand_from lang' -a 'en zh-CN auto'

# -e/--env arg completion at any position before pass-through
complete -c cce -s e -l env -a '(__cce_envs)' -d 'Use an env'
complete -c cce -s m -l merge-mode -x -a 'override cce claude' -d 'settings.json env merge mode'
`;
}

function powershellScript() {
  return `# cce PowerShell completion — install with: cce completion powershell >> $PROFILE
Register-ArgumentCompleter -CommandName cce -Native -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $tokens = $commandAst.CommandElements | ForEach-Object { $_.Extent.Text }
    # Drop the command name itself ('cce')
    if ($tokens.Count -gt 0) { $tokens = $tokens[1..($tokens.Count - 1)] }

    $prev = if ($tokens.Count -ge 2) { $tokens[-2] } else { '' }

    function _Envs {
        try {
            (& cce completion --envs 2>$null) -split "\`r?\`n" | Where-Object { $_ }
        } catch { @() }
    }

    $subcommands = @('list','ls','show','edit','use','current','lang','pick','completion','help')
    $flags       = @('-e','--env','-m','--merge-mode','-h','--help','-v','--version')

    # Complete env names after these tokens
    if ($prev -in @('-e','--env','use','show')) {
        _Envs | Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
        return
    }

    if ($prev -eq 'completion') {
        @('bash','zsh','powershell','fish') | Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
        return
    }

    if ($prev -in @('-m','--merge-mode')) {
        @('override','cce','claude') | Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
        return
    }

    if ($prev -eq 'lang') {
        @('en','zh-CN','auto') | Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
        return
    }

    # First positional after 'cce'
    if ($tokens.Count -le 1) {
        $subcommands + $flags |
            Where-Object { $_ -like "$wordToComplete*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_) }
        return
    }

    $flags | Where-Object { $_ -like "$wordToComplete*" } |
        ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_) }
}
`;
}

module.exports = { run };
