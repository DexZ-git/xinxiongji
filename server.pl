#!/usr/bin/perl
# 极简本地静态服务器（仅本地预览用；生产是 Cloudflare Pages 静态托管，不需要它）
# 用法: perl server.pl [port] [docroot]
use strict;
use warnings;
use IO::Socket::INET;

my $port = $ARGV[0] || 4200;
my $root = $ARGV[1];
chdir $root if $root && -d $root;

my %CT = (
  html => 'text/html; charset=utf-8',
  js   => 'application/javascript; charset=utf-8',
  css  => 'text/css; charset=utf-8',
  json => 'application/json; charset=utf-8',
  png  => 'image/png',
  jpg  => 'image/jpeg',
  jpeg => 'image/jpeg',
  gif  => 'image/gif',
  svg  => 'image/svg+xml',
  ico  => 'image/x-icon',
  webmanifest => 'application/manifest+json',
);

my $srv = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1',
  LocalPort => $port,
  Listen    => 50,
  ReuseAddr => 1,
  Proto     => 'tcp',
) or die "cannot bind port $port: $!";

$| = 1;
print "新熊记 serving http://127.0.0.1:$port  (root=" . `cd` . ")\n";

while (my $c = $srv->accept) {
  my $req = <$c>;
  while (my $h = <$c>) { last if $h =~ /^\r?\n$/; }   # drain headers
  if ($req && $req =~ m{^GET\s+(\S+)\s+HTTP}) {
    my $path = $1;
    $path =~ s/\?.*$//;                                 # strip query
    $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;       # url-decode
    $path = '/index.html' if $path eq '/';
    $path =~ s{^/}{};
    $path =~ s{\.\.}{}g;                                # no traversal
    if (-f $path) {
      my ($ext) = $path =~ /\.(\w+)$/;
      my $ct = $CT{ lc($ext || '') } || 'application/octet-stream';
      open my $fh, '<:raw', $path or next;
      local $/; my $data = <$fh>; close $fh;
      print $c "HTTP/1.1 200 OK\r\nContent-Type: $ct\r\n"
             . "Content-Length: " . length($data) . "\r\n"
             . "Cache-Control: no-cache\r\nConnection: close\r\n\r\n";
      binmode $c; print $c $data;
    } else {
      my $body = "404 Not Found: $path";
      print $c "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain; charset=utf-8\r\n"
             . "Content-Length: " . length($body) . "\r\nConnection: close\r\n\r\n$body";
    }
  }
  close $c;
}
